import * as d3 from 'd3';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';

import type { AutkDatum, ChartConfig, ChartMargins, ChartEvents, ChartEventRecord, ChartTransformConfig } from './api';
import { ColorMapInterpolator, ColorMapDomainStrategy, ColorMap, EventEmitter, valueAtPath } from './core-types';
import type { ColorMapDomainSpec, ResolvedDomain } from './core-types';
import { ChartEvent } from './events-types';
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

    /** Current selected source ids. */
    protected _selection: number[] = [];

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
    protected _chartEvents!: ChartEvents;
    /** Events explicitly enabled for this chart instance. */
    protected _enabledEvents: ChartEvent[] = [];

    /** Domain specification for color encoding (from config). */
    protected _domainSpec: ColorMapDomainSpec | undefined = undefined;
    /** Resolved color domain, computed from data after each transform. */
    protected _resolvedDomain: ResolvedDomain | undefined = undefined;

    /** CSS property to apply color to: 'fill' for area marks, 'stroke' for line marks. */
    protected _colorProperty: 'fill' | 'stroke' = 'fill';
    /** Active colormap interpolator used by charts that support color encoding. */
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQUENTIAL_REDS;

    /** Optional transform config shared by chart implementations that support transformed views. */
    protected _transformConfig?: ChartTransformConfig;

    /** Active brush rectangles keyed by brush id. Only one brush type is active at a time. */
    protected _activeBrushes: Map<string, [number, number, number, number]> = new Map();

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

        const axisLabels = config.labels?.axis ?? [];
        const axisAttributes = config.attributes?.axis ?? axisLabels;

        this._axisLabels = axisLabels.length > 0 ? axisLabels : axisAttributes;
        this._axisAttributes = axisAttributes;

        this._colorLabel = config.labels?.color;
        this._colorAttribute = config.attributes?.color ?? config.labels?.color;

        this._title = config.labels?.title || 'Autk Plot';
        this._tickFormats = config.tickFormats ?? ['', ''];

        this._width = config.width || 800;
        this._height = config.height || 500;
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };

        this._chartEvents = new EventEmitter<ChartEventRecord>();
        this._enabledEvents = config.events ?? [];

        this._domainSpec = config.domainSpec;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQUENTIAL_REDS;

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
     * Returns selected source ids.
     * @returns Current source ids selected in the chart.
     */
    get selection(): number[] {
        return this._selection;
    }

    /**
     * Updates selected source ids.
     * @param selection Source ids to mark as selected.
     */
    set selection(selection: number[]) {
        this._selection = selection;
        this.applyChartSelection();
    }

    /**
     * Returns the chart event dispatcher.
     * @returns Typed plot event dispatcher for listener registration.
     */
    get events(): ChartEvents {
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

        this._resolvedDomain = ColorMap.resolveDomainFromData(
            values as number[] | string[],
            {
                interpolator: this._colorMapInterpolator,
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

        if (datum?.autkIds?.some(id => this.selection.includes(id))) {
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
            const { r, g, b } = ColorMap.getColor(t, this._colorMapInterpolator, categories);
            return `rgb(${r},${g},${b})`;
        } else {
            const rawVal = Number(valueAtPath(datum, this._colorAttribute)) || 0;
            const numDomain = this._resolvedDomain as [number, number] | [number, number, number];
            const { r, g, b } = ColorMap.getColor(rawVal, this._colorMapInterpolator, numDomain);
            return `rgb(${r},${g},${b})`;
        }
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

        svgs
            .each(function (d) {
                d3.select(this)
                    .on('click', function () {
                        const ids = (d as AutkDatum)?.autkIds ?? [];
                        if (ids.length === 0) return;

                        const next = new Set(chart.selection);
                        const isFullySelected = ids.every((id) => next.has(id));

                        if (isFullySelected) {
                            ids.forEach((id) => next.delete(id));
                        } else {
                            ids.forEach((id) => next.add(id));
                        }

                        chart.selection = Array.from(next);
                        chart.events.emit(ChartEvent.CLICK, { selection: chart.selection });
                    });
            });

        cls
            .on('click', function () {
                chart.selection = [];
                chart.events.emit(ChartEvent.CLICK, { selection: [] });
            });
    }

    /**
     * Enables 2D rectangular brushing interactions.
     *
     * Brush rectangles are translated to marks-group coordinates before
     * geometric intersection is evaluated.
     */
    brushEvent(): void {
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
                        if (event.selection) {
                            const [x0, y0] = event.selection[0];
                            const [x1, y1] = event.selection[1];
                            // No transform shift needed
                            chart._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.events.emit(ChartEvent.BRUSH, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH, chart._activeBrushes);
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Enables horizontal brushing interactions.
     *
     * For multiple brush hosts, brush extents are narrow in X to support
     * per-axis style interactions.
     */
    brushXEvent(): void {
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
                        if (event.selection) {
                            // No transform shift needed
                            const x0 = event.selection[0];
                            const y0 = -10;
                            const x1 = event.selection[1];
                            const y1 = chart._height;

                            chart._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_X, chart._activeBrushes);
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Enables vertical brushing interactions.
     *
     * For multiple brush hosts, brush extents are narrow in X to support
     * per-axis style interactions.
     */
    brushYEvent(): void {
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
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushes);
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_Y, chart._activeBrushes);
                        }
                    });
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
    private resolveSelectionFromRects(activeBrushes: Map<string, [number, number, number, number]>): number[] {
        const rects = Array.from(activeBrushes.values());
        if (rects.length === 0) return [];

        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const nextSel = new Set<number>();

        marksGroup.selectAll('.autkMark')
            .each((d, id: number, nodes) => {
                const node = nodes[id] as SVGGeometryElement | null;
                if (!node) return;

                const hits = rects.map(([x0, y0, x1, y1]) => this.nodeIntersectsRect(node, x0, y0, x1, y1));
                const selected = (this._MODE === 'and') ? hits.every(Boolean) : hits.some(Boolean);

                if (selected) {
                    ((d as AutkDatum)?.autkIds ?? []).forEach((sourceId) => nextSel.add(sourceId));
                }
            });

        return Array.from(nextSel);
    }

    /**
     * Applies resolved brush selection, emits the event payload, and refreshes styles.
     * @param event Event type to emit.
     * @param activeBrushes Active brush rectangles for that event type.
     */
    private applyBrushSelection(event: ChartEvent, activeBrushes: Map<string, [number, number, number, number]>): void {
        const selection = activeBrushes.size === 0 ? [] : this.resolveSelectionFromRects(activeBrushes);
        this.selection = selection;
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
