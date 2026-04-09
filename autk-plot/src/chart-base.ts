import * as d3 from 'd3';

import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type {
    AutkDatum,
    ChartConfig,
    ChartMargins,
    ChartTransformConfig,
} from './api';

import {
    ColorMapInterpolator,
    ColorMapDomainStrategy,
    ColorMap,
    EventEmitter,
    valueAtPath,
} from './core-types';
import type { ColorMapDomainSpec, ResolvedDomain } from './core-types';

import { ChartEvent } from './events-types';
import type { ChartEventRecord } from './events-types';

import { ChartStyle } from './chart-style';

/**
 * Base class for all chart implementations.
 *
 * Normalizes input data, stores common rendering options, tracks selection
 * state, and provides D3-driven interaction wiring (brush, click, selection
 * resolution, mark styling).
 *
 * Identity mapping for interactions is based on `autkIds`, which always refer
 * to source feature ids from the input collection.
 *
 * Subclasses are expected to render marks with `.autkMark` and, when brushing
 * is enabled, expose brush hosts using `.autkBrush` plus `.autkMarksGroup`.
 */
export abstract class ChartBase {

    /** Host element where the chart is rendered. */
    protected _div!: HTMLElement;

    /** Original source features from the input collection, indexed by source feature id. */
    protected _sourceFeatures!: Feature<Geometry, GeoJsonProperties>[];
    /** Normalized render rows bound to marks. */
    protected _data!: AutkDatum[];

    /**
     * Datums of marks directly selected by local interaction (brush/click).
     * Owned exclusively by interaction handlers. Neither `setSelection` nor external
     * callers may touch this field.
     */
    private _selectedMarkDatums: Set<object> = new Set();

    /**
     * Feature IDs set by an external linked view via `setSelection`.
     * Owned exclusively by `setSelection`. Neither brush nor click handlers may touch this field.
     */
    private _selectedFeatureIds: Set<number> = new Set();

    /** Dot-path attributes used to read values from row objects. */
    protected _axisAttributes!: string[];
    /** User-facing axis labels. */
    protected _axisLabels!: string[];
    
    /** Dot-path attribute used for color encoding, if any. */
    protected _colorAttribute: string | undefined = undefined;
    /** User-facing label for the color dimension. */
    protected _colorLabel: string | undefined = undefined;
    
    /** Plot title text. */
    protected _title!: string;
    /** D3 tick-format specifiers used by axis renderers. */
    protected _tickFormats!: string[];

    /** Outer chart width in pixels. */
    protected _width: number = 800;
    /** Outer chart height in pixels. */
    protected _height: number = 500;
    /** Plot margins in pixels. */
    protected _margins!: ChartMargins;

    /** Typed event dispatcher used by chart interaction events. */
    protected _chartEvents!: EventEmitter<ChartEventRecord>;
    /** Events explicitly enabled for this chart instance. */
    protected _enabledEvents: ChartEvent[] = [];

    /** Domain specification for color encoding (from config). */
    protected _domainSpec: ColorMapDomainSpec | undefined = undefined;
    /** Resolved color domain, computed from data after each transform. */
    protected _resolvedDomain: ResolvedDomain | undefined = undefined;

    /** CSS property to apply color to: 'fill' for area marks, 'stroke' for line marks. */
    protected _colorProperty: 'fill' | 'stroke' = 'fill';
    /** Color interpolator used for continuous (numeric) color encoding. */
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQ_REDS;
    /** Color interpolator used when the color attribute contains categorical (string) values. */
    protected _categoricalColorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.CAT_OBSERVABLE10;

    /** Optional transform config shared by chart implementations that support transformed views. */
    protected _transformConfig?: ChartTransformConfig;

    
    /** Active brush rectangles keyed by brush id. Only one brush type is active at a time. */
    protected _activeBrushes: Map<string, [number, number, number, number]> = new Map();
    /** Stored brush behavior instances keyed by brush id, used for programmatic visual clearing. */
    private _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> = new Map();
    /** When true, brush event handlers skip event emission (used during programmatic brush clearing). */
    private _suppressBrushEvents: boolean = false;


    /**
     * Brush combine mode for multi-brush interactions.
     * When multiple brushes are active, this controls whether marks must satisfy
     * all (`and`) or any (`or`) brush pre dicates to be selected.
     */
    protected _MODE: 'and' | 'or' = 'and';

    /**
     * Initializes shared chart state from plot configuration.
     *
     * Input feature properties are normalized through `ensureAutkIds` so
     * interaction identity is consistent across all chart implementations.
     *
     * @param config Plot configuration containing input collection and render options.
     */
    constructor(config: ChartConfig) {
        this._div = config.div;

        this._sourceFeatures = config.collection.features;
        this._data = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];

        const hasTransformPlaceholder = [
            ...(config.attributes?.axis ?? []),
            config.attributes?.color,
        ].includes('@transform');

        if (config.transform?.preset === 'sort' && hasTransformPlaceholder) {
            throw new Error("'@transform' cannot be used with the 'sort' preset.");
        }

        const axisLabels = config.labels?.axis ?? [];
        const axisAttributes = config.attributes?.axis ?? axisLabels;
        const transformOptions = config.transform?.options as { reducer?: string } | undefined;
        const reducer = transformOptions?.reducer ?? 'count';

        this._axisLabels = axisLabels.length > 0
            ? axisLabels
            : axisAttributes.map(attr => attr === '@transform' ? String(reducer) : attr);
        this._axisAttributes = axisAttributes;

        this._colorLabel = config.labels?.color;
        this._colorAttribute = config.attributes?.color ?? config.labels?.color;

        this._title = config.labels?.title || 'Autk Plot';
        this._tickFormats = config.tickFormats ?? ['', ''];

        this._width = config.width || 800;
        this._height = config.height || 500;
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };

        this._chartEvents = new EventEmitter();
        this._enabledEvents = config.events ?? [];

        this._domainSpec = config.domainSpec;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
        this._categoricalColorMapInterpolator = config.categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;

        this._transformConfig = config.transform;
    }


    // --- Data and state accessors ---

    /**
     * Returns internal data rows used by the chart.
     * @returns Normalized render rows used for mark binding.
     */
    get data(): AutkDatum[] {
        return this._data;
    }

    /**
     * Replaces internal data rows.
     *
     * Incoming rows are normalized to ensure each datum carries `autkIds`.
     *
     * @param data New rendered rows.
     */
    set data(data: GeoJsonProperties[]) {
        this._data = data as AutkDatum[];
    }

    /**
     * Returns the feature IDs derived from the current interaction selection.
     * Used by brush/click event emission. Does not include externally-set feature IDs.
     */
    get selection(): number[] {
        const fids = new Set<number>();
        for (const datum of this._selectedMarkDatums) {
            const ids = (datum as AutkDatum).autkIds ?? [];
            for (const fid of ids) fids.add(fid);
        }
        return Array.from(fids);
    }

    /**
     * Sets an external highlight from a linked view.
     * Owns `_selectedFeatureIds` exclusively — does not touch `_selectedMarkDatums`.
     */
    setSelection(selection: number[]): void {
        this._selectedFeatureIds = new Set(selection);
        if (selection.length === 0) {
            this._selectedMarkDatums = new Set();
            this._activeBrushes.clear();
            this.clearBrushVisuals();
        }
        this.applyChartSelection();
    }

    /**
     * Removes all D3 brush rectangle visuals from the chart without firing brush events.
     * Called when selection is cleared externally. Uses stored brush behavior instances
     * to call `.move(selection, null)` on each brush element.
     */
    private clearBrushVisuals(): void {
        this._suppressBrushEvents = true;
        const chart = this;
        d3.select(this._div)
            .selectAll<SVGGElement, unknown>('.autkBrush')
            .each(function (_d, i) {
                const el = d3.select<SVGGElement, unknown>(this);
                const dim = el.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);
                const brush = chart._brushBehaviors.get(brushKey);
                if (brush) {
                    brush.move(el, null);
                }
            });
        this._suppressBrushEvents = false;
    }

    /**
     * Returns the chart event dispatcher.
     * @returns Typed plot event dispatcher for listener registration.
     */
    get events(): EventEmitter<ChartEventRecord> {
        return this._chartEvents;
    }

    /**
     * Returns the list of explicitly enabled event types for this chart.
     * @returns Event types configured at construction time.
     */
    get enabledEvents(): ChartEvent[] {
        return this._enabledEvents;
    }

    // --- Lifecycle ---

    /**
     * Template method. Calls `computeTransform()`, `computeColorDomain()`, then `render()`.
     * Do not override — implement `render()` instead.
     */
    public draw(): void {
        this.computeTransform();
        this.computeColorDomain();
        this.render();
    }

    /**
     * Transforms `this._data` before rendering.
     *
     * The default implementation is a no-op. Override this method to aggregate
     * or reorder data while preserving `autkIds` on each rendered datum.
     */
    protected computeTransform(): void {}

    /**
     * Resolves and caches the color domain for the active color attribute.
     *
     * Extracts all values for `_colorAttribute` from `this.data`, then calls
     * `ColorMap.resolveDomainFromData()` using the configured interpolator and
     * domain spec. The result is stored in `_resolvedDomain`.
     *
     * No-op when no `_colorAttribute` is set.
     */
    protected computeColorDomain(): void {
        if (!this._colorAttribute) return;

        const values = this.data
            .filter(d => d != null)
            .map(d => valueAtPath(d!, this._colorAttribute!))
            .filter(v => v != null && !(typeof v === 'number' && !Number.isFinite(v)));

        if (values.length === 0) return;

        const isCategorical = values.some(v => typeof v === 'string' && isNaN(Number(v as string)));
        const interpolator = isCategorical ? this._categoricalColorMapInterpolator : this._colorMapInterpolator;

        this._resolvedDomain = ColorMap.resolveDomainFromData(
            values as number[] | string[],
            {
                interpolator,
                domainSpec: this._domainSpec ?? { type: ColorMapDomainStrategy.MIN_MAX },
            },
        );
    }

    /**
     * Returns the color for a single mark datum.
     *
     * Resolution order:
     * 1. Selected → `ChartStyle.highlight`
     * 2. Color attribute active → data-driven color from `_resolvedDomain`
     * 3. Fallback → `ChartStyle.default`
     *
     * @param d Bound datum.
     * @returns CSS color string.
     */
    protected getMarkColor(d: unknown): string {
        const datum = d as AutkDatum;

        if (this.isMarkHighlighted(d)) {
            return ChartStyle.highlight;
        }

        if (!this._colorAttribute || !this._resolvedDomain) {
            return ChartStyle.default;
        }

        if (typeof this._resolvedDomain[0] === 'string') {
            const categories = this._resolvedDomain as string[];
            const rawVal = String(valueAtPath(datum, this._colorAttribute));
            const idx = categories.indexOf(rawVal);
            const t = categories.length <= 1 ? 0.5 : Math.max(0, idx) / (categories.length - 1);
            const interpolator = this._categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;
            const { r, g, b } = ColorMap.getColor(t, interpolator, categories);
            return `rgb(${r},${g},${b})`;
        } else {
            const rawVal = Number(valueAtPath(datum, this._colorAttribute)) || 0;
            const numDomain = this._resolvedDomain as [number, number] | [number, number, number];
            const interpolator = this._colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
            const { r, g, b } = ColorMap.getColor(rawVal, interpolator, numDomain);
            return `rgb(${r},${g},${b})`;
        }
    }

    /**
     * Returns `true` when a mark should be highlighted.
     *
     * Union of two independent layers:
     * 1. Mark was directly selected by local interaction (`_selectedMarkDatums`).
     * 2. Any of the mark's feature IDs are in the external selection (`_selectedFeatureIds`).
     *
     * @param d Bound mark datum.
     */
    protected isMarkHighlighted(d: unknown): boolean {
        if (d == null || typeof d !== 'object') return false;

        if (this._selectedMarkDatums.has(d as object)) return true;

        if (this._selectedFeatureIds.size > 0) {
            return ((d as AutkDatum).autkIds ?? []).some(fid => this._selectedFeatureIds.has(fid));
        }

        return false;
    }

    /**
     * Renders chart DOM/SVG/HTML nodes for the current internal state.
     */
    abstract render(): void;


    // --- Interaction wiring ---


    /**
     * Attaches only the interaction handlers requested in the event config.
     *
     * Called at the end of `render()` in subclasses, after marks and brush
     * hosts are present in the DOM.
     */
    configureSignalListeners(): void {
        for (const event of this.enabledEvents) {
            if (event === ChartEvent.CLICK) {
                this.clickEvent();
            } else if (event === ChartEvent.BRUSH) {
                this.brushEvent();
            } else if (event === ChartEvent.BRUSH_X) {
                this.brushXEvent();
            } else if (event === ChartEvent.BRUSH_Y) {
                this.brushYEvent();
            }
        }
    }

    /**
     * Enables click-based mark selection and clear interactions.
     *
     * Clicking `.autkMark` toggles its represented source ids. Clicking
     * `.autkClear` resets the selection.
     */
    clickEvent(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');
        const chart = this;

        svgs.each(function (d) {
            d3.select(this).on('click', function () {
                if (d == null || typeof d !== 'object') return;
                if (chart._selectedMarkDatums.has(d as object)) {
                    chart._selectedMarkDatums.delete(d as object);
                } else {
                    chart._selectedMarkDatums.add(d as object);
                }
                if (chart._selectedMarkDatums.size === 0) {
                    chart._selectedFeatureIds = new Set();
                }
                chart.applyChartSelection();
                chart.events.emit(ChartEvent.CLICK, { selection: chart.selection });
            });
        });

        cls.on('click', function () {
            chart._selectedMarkDatums = new Set();
            chart._selectedFeatureIds = new Set();
            chart.applyChartSelection();
            chart.events.emit(ChartEvent.CLICK, { selection: [] });
        });
    }

    /**
     * Enables 2D rectangular brushing interactions.
     *
     * Brush rectangles are translated to marks-group coordinates before
     * geometric intersection is evaluated.
     */
    protected brushEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        // const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const chart = this;

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brush()
                    .extent([[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]])
                    .on("start brush end", function (event: any) {
                        if (chart._suppressBrushEvents) return;
                        if (event.selection) {
                            const [x0, y0] = event.selection[0];
                            const [x1, y1] = event.selection[1];
                            // No transform shift needed
                            chart._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.applyChartSelection();
                            chart.events.emit(ChartEvent.BRUSH, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH, chart._activeBrushes);
                        }
                    });
                chart._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Enables horizontal brushing interactions.
     *
     * For multiple brush hosts, brush extents are narrow in X to support
     * per-axis style interactions.
     */
    protected brushXEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        // const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const chart = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, chart._height - chart._margins.top - chart._margins.bottom]] :
            [[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushX()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (chart._suppressBrushEvents) return;
                        if (event.selection) {
                            // No transform shift needed
                            const x0 = event.selection[0];
                            const y0 = -10;
                            const x1 = event.selection[1];
                            const y1 = chart._height;

                            chart._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.applyChartSelection();
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_X, chart._activeBrushes);
                        }
                    });
                chart._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Enables vertical brushing interactions.
     *
     * For multiple brush hosts, brush extents are narrow in X to support
     * per-axis style interactions.
     */
    protected brushYEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const chart = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, chart._height - chart._margins.top - chart._margins.bottom]] :
            [[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushY()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (chart._suppressBrushEvents) return;
                        if (event.selection) {
                            // Inline transform/offset computation for axis-aligned brushing
                            const cTransform = cBrush.attr('transform');
                            const mTransform = marksGroup.attr('transform');
                            const parse = (t: string | null) => {
                                const delta = t?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                                return [delta ? parseFloat(delta[1]) : 0, delta ? parseFloat(delta[2]) : 0];
                            };
                            const [cX, cY] = parse(cTransform);
                            const [mX, mY] = parse(mTransform);

                            const shiftX = cX - mX;
                            const shiftY = cY - mY;
                            const extWidth = 10;

                            const x0 = shiftX - extWidth;
                            const y0 = event.selection[0] + shiftY;
                            const x1 = shiftX + extWidth;
                            const y1 = event.selection[1] + shiftY;

                            chart._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.applyChartSelection();
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_Y, chart._activeBrushes);
                        }
                    });
                chart._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Called after mark styles are applied on each selection update.
     *
     * Override for post-selection DOM work (e.g. row re-rendering in a table).
     */
    protected onSelectionUpdated(): void {}


    /**
     * Refreshes all mark styles to reflect the current selection state.
     */
    protected applyChartSelection(): void {
        const svgs = d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark');
        this.applyMarkStyles(svgs);
        this.onSelectionUpdated();
    }

    /**
     * Applies color to mark elements using `_colorProperty` (fill or stroke).
     *
     * Color resolution order: selection highlight → data-driven colormap → default.
     * Override only for non-color effects (opacity, stroke-width, `.raise()`).
     * @param svgs Selection containing mark nodes.
     */
    protected applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        svgs.style(this._colorProperty, (d: unknown) => this.getMarkColor(d));
    }

    // --- Brush helpers ---

    /**
     * Resolves selection ids from active brush rectangles.
     *
     * Each `.autkMark` geometry is tested against every active rectangle and
     * included according to the current combine mode (`and` / `or`).
     *
     * @param activeBrushes Active brush rectangles keyed by brush id.
     * @returns Source ids represented by marks that satisfy brush predicates.
     */
    protected resolveSelectionFromRects(activeBrushes: Map<string, [number, number, number, number]>): number[] {
        const rects = Array.from(activeBrushes.values());
        if (rects.length === 0) return [];

        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');

        this._selectedMarkDatums = new Set();
        marksGroup.selectAll('.autkMark')
            .each((d, i: number, nodes) => {
                const node = nodes[i] as SVGGeometryElement | null;
                if (!node) return;

                const hits = rects.map(([x0, y0, x1, y1]) => this.nodeIntersectsRect(node, x0, y0, x1, y1));
                const selected = (this._MODE === 'and') ? hits.every(Boolean) : hits.some(Boolean);

                if (selected && d != null && typeof d === 'object') {
                    this._selectedMarkDatums.add(d as object);
                }
            });

        return this.selection;
    }

    /**
     * Applies resolved brush selection, emits the event payload, and refreshes styles.
     * @param event Event type to emit.
     * @param activeBrushes Active brush rectangles for that event type.
     */
    private applyBrushSelection(event: ChartEvent, activeBrushes: Map<string, [number, number, number, number]>): void {
        if (activeBrushes.size === 0) {
            this._selectedMarkDatums = new Set();
            this._selectedFeatureIds = new Set();
        } else {
            this.resolveSelectionFromRects(activeBrushes);
        }
        this.applyChartSelection();
        this.events.emit(event, { selection: this.selection });
    }

    /**
     * Tests whether a mark geometry intersects a brush rectangle.
     * @param node SVG geometry node being tested.
     * @param x0 Rectangle corner X.
     * @param y0 Rectangle corner Y.
     * @param x1 Opposite rectangle corner X.
     * @param y1 Opposite rectangle corner Y.
     * @returns `true` when node geometry intersects the brush rectangle.
     */
    private nodeIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const rx0 = Math.min(x0, x1);
        const rx1 = Math.max(x0, x1);
        const ry0 = Math.min(y0, y1);
        const ry1 = Math.max(y0, y1);

        const bbox = node.getBBox();
        const bx0 = bbox.x;
        const by0 = bbox.y;
        const bx1 = bbox.x + bbox.width;
        const by1 = bbox.y + bbox.height;

        const bboxOverlaps = !(bx1 < rx0 || bx0 > rx1 || by1 < ry0 || by0 > ry1);
        if (!bboxOverlaps) return false;

        const geomNode = node as any;
        if (typeof geomNode.getTotalLength === 'function' && typeof geomNode.getPointAtLength === 'function') {
            const total = geomNode.getTotalLength() as number;

            if (total > 0) {
                const steps = 1000;
                for (let i = 0; i <= steps; i++) {
                    const p = geomNode.getPointAtLength((i / steps) * total) as DOMPoint;
                    if (p.x >= rx0 && p.x <= rx1 && p.y >= ry0 && p.y <= ry1) {
                        return true;
                    }
                }
                return false;
            }
        }

        return true;
    }
}
