import * as d3 from 'd3';

import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from './types-chart';

import type {
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
} from './types-core';
import type { ColorMapDomainSpec, ResolvedDomain } from './types-core';

import { ChartEvent } from './types-events';
import type { ChartEventRecord } from './types-events';

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

    /** Dot-path attributes used to read values from source rows. */
    protected _axisAttributes!: string[];
    /** Dot-path attributes used to read values from transformed rows, when applicable. */
    protected _transformAttributes: string[] | undefined = undefined;
    /** User-facing axis labels. */
    protected _axisLabels!: string[];
    
    /** Dot-path attribute used for color encoding on source rows, if any. */
    protected _colorAttribute: string | undefined = undefined;
    /** Dot-path attribute used for color encoding on transformed rows, when applicable. */
    protected _transformColorAttribute: string | undefined = undefined;
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

    /** Events explicitly enabled for this chart instance. */
    protected _enabledEvents: ChartEvent[] = [];

    /** Resolved color domain, computed from data after each transform. */
    protected _resolvedDomain: ResolvedDomain | undefined = undefined;

    /** CSS property to apply color to: 'fill' for area marks, 'stroke' for line marks. */
    protected _colorProperty: 'fill' | 'stroke' = 'fill';

    /** Optional transform config shared by chart implementations that support transformed views. */
    protected _transformConfig?: ChartTransformConfig;

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

    /** Where the current selection was last authored from. */
    private _selectionOrigin: 'local' | 'external' | null = null;
    /** How selection should project back from feature ids to rendered marks. */
    private _selectionProjection: 'bijective' | 'aggregated' = 'bijective';  

    /** Typed event dispatcher used by chart interaction events. */
    private _chartEvents!: EventEmitter<ChartEventRecord>;

    /** Domain specification for color encoding (from config). */
    private _domainSpec: ColorMapDomainSpec | undefined = undefined;

    /** Color interpolator used for continuous (numeric) color encoding. */
    private _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQ_REDS;
    /** Color interpolator used when the color attribute contains categorical (string) values. */
    private _categoricalColorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.CAT_OBSERVABLE10;

    /** Active brush rectangles keyed by brush id. Only one brush type is active at a time. */
    private _activeBrushes: Map<string, [number, number, number, number]> = new Map();
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
        this._axisAttributes = [...axisAttributes];

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
        this._selectionProjection = this.resolveSelectionProjection(config.transform);
    }
    /**
     * Returns the active selection as source feature ids.
     */
    get selection(): number[] {
        return Array.from(this._selectedFeatureIds);
    }

    /**
     * Returns the chart event dispatcher.
     * @returns Typed plot event dispatcher for listener registration.
     */
    get events(): EventEmitter<ChartEventRecord> {
        return this._chartEvents;
    }    

    /**
     * Replaces the chart's data collection and redraws in place.
     *
     * Resets all selection state. Does not recreate the chart instance or
     * touch the DOM outside of the normal `draw()` render path.
     *
     * @param collection New GeoJSON feature collection to render.
     */
    updateCollection(collection: import('geojson').FeatureCollection<Geometry, GeoJsonProperties>): void {
        this._sourceFeatures = collection.features;
        this._data = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
        this._selectedMarkDatums = new Set();
        this._selectedFeatureIds = new Set();
        this._selectionOrigin = null;
        this._activeBrushes.clear();
        this.draw();
    }

    /**
     * Sets an external highlight from a linked view and resolves matching mark datums.
     */
    setSelection(selection: number[]): void {
        this._selectedFeatureIds = new Set(selection);
        this._selectionOrigin = selection.length > 0 ? 'external' : null;
        this.syncSelectedMarksFromFeatures();
        if (selection.length === 0) {
            this._activeBrushes.clear();
            this.clearBrushVisuals();
        }
        this.renderSelection();
    }


    /**
     * Template method. Calls `computeTransform()`, `computeColorDomain()`, then `render()`.
     * Do not override — implement `render()` instead.
     */
    public draw(): void {
        this._transformAttributes = undefined;
        this._transformColorAttribute = undefined;
        this.computeTransform();
        this.computeColorDomain();
        this.render();
    }

    /**
     * Attaches only the interaction handlers requested in the event config.
     *
     * Called at the end of `render()` in subclasses, after marks and brush
     * hosts are present in the DOM.
     */
    public configureSignalListeners(): void {
        for (const event of this._enabledEvents) {
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
     * Renders chart DOM/SVG/HTML nodes for the current internal state.
     */
    abstract render(): void;    


    /**
     * Transforms `this._data` before rendering.
     *
     * The default implementation is a no-op. Override this method to aggregate
     * or reorder data while preserving `autkIds` on each rendered datum.
     */
    protected computeTransform(): void {}

    /**
     * Returns the attributes used to read the current rendered rows.
     */
    protected get renderAxisAttributes(): string[] {
        return this._transformAttributes ?? this._axisAttributes;
    }

    /**
     * Returns the color attribute used to read the current rendered rows.
     */
    protected get renderColorAttribute(): string | undefined {
        return this._transformColorAttribute ?? this._colorAttribute;
    }

    /**
     * Resolves and caches the color domain for the active color attribute.
     *
     * Extracts all values for the active render color attribute from `_data`, then calls
     * `ColorMap.resolveDomainFromData()` using the configured interpolator and
     * domain spec. The result is stored in `_resolvedDomain`.
     *
     * No-op when no active render color attribute is set.
     */
    protected computeColorDomain(): void {
        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute) return;

        const values = this._data
            .filter(d => d != null)
            .map(d => valueAtPath(d!, colorAttribute))
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

        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute || !this._resolvedDomain) {
            return ChartStyle.default;
        }

        if (typeof this._resolvedDomain[0] === 'string') {
            const categories = this._resolvedDomain as string[];
            const rawVal = String(valueAtPath(datum, colorAttribute));
            const idx = categories.indexOf(rawVal);
            const t = categories.length <= 1 ? 0.5 : Math.max(0, idx) / (categories.length - 1);
            const interpolator = this._categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;
            const { r, g, b } = ColorMap.getColor(t, interpolator, categories);
            return `rgb(${r},${g},${b})`;
        } else {
            const rawVal = Number(valueAtPath(datum, colorAttribute)) || 0;
            const numDomain = this._resolvedDomain as [number, number] | [number, number, number];
            const interpolator = this._colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
            const { r, g, b } = ColorMap.getColor(rawVal, interpolator, numDomain);
            return `rgb(${r},${g},${b})`;
        }
    }

    /**
     * Returns `true` when a mark should be highlighted.
     *
     * @param d Bound mark datum.
     */
    protected isMarkHighlighted(d: unknown): boolean {
        if (d == null || typeof d !== 'object') return false;

        const datum = d as AutkDatum;

        if (this._selectionProjection === 'aggregated') {
            if (this._selectionOrigin === 'local') {
                return this._selectedMarkDatums.has(d as object);
            }
            if (this._selectionOrigin === 'external') {
                return (datum.autkIds ?? []).some(fid => this._selectedFeatureIds.has(fid));
            }
            return false;
        }

        if (this._selectedMarkDatums.has(d as object)) return true;

        if (this._selectedFeatureIds.size > 0) {
            return (datum.autkIds ?? []).some(fid => this._selectedFeatureIds.has(fid));
        }

        return false;
    }


    /**
     * Enables click-based mark selection and clear interactions.
     *
     * Clicking `.autkMark` toggles its represented source ids. Clicking
     * `.autkClear` resets the selection.
     */
    protected clickEvent(): void {
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
                chart.syncSelectedFeaturesFromMarks();
                chart._selectionOrigin = chart._selectedFeatureIds.size > 0 ? 'local' : null;
                chart.renderSelection();
                chart.events.emit(ChartEvent.CLICK, { selection: chart.selection });
            });
        });

        cls.on('click', function () {
            chart._selectedMarkDatums = new Set();
            chart._selectedFeatureIds = new Set();
            chart._selectionOrigin = null;
            chart.renderSelection();
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
                            chart.renderSelection();
                            chart.events.emit(ChartEvent.BRUSH, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.commitBrushSelection(ChartEvent.BRUSH, chart._activeBrushes);
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
                            chart.renderSelection();
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.commitBrushSelection(ChartEvent.BRUSH_X, chart._activeBrushes);
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
                            chart.renderSelection();
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.selection });
                        } else {
                            chart._activeBrushes.delete(brushKey);
                            chart.commitBrushSelection(ChartEvent.BRUSH_Y, chart._activeBrushes);
                        }
                    });
                chart._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Refreshes all mark styles to reflect the current selection state.
     */
    protected renderSelection(): void {
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


    /**
     * Called after mark styles are applied on each selection update.
     *
     * Override for post-selection DOM work (e.g. row re-rendering in a table).
     */
    protected onSelectionUpdated(): void {}


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

                const hits = rects.map(([x0, y0, x1, y1]) => this.markIntersectsRect(node, x0, y0, x1, y1));
                const selected = (this._MODE === 'and') ? hits.every(Boolean) : hits.some(Boolean);

                if (selected && d != null && typeof d === 'object') {
                    this._selectedMarkDatums.add(d as object);
                }
            });

        this.syncSelectedFeaturesFromMarks();
        this._selectionOrigin = this._selectedFeatureIds.size > 0 ? 'local' : null;
        return this.selection;
    }

    /**
     * Tests whether a rendered mark datum intersects a brush rectangle.
     *
     * Subclasses can override this to use chart-aware geometry checks instead of
     * generic SVG path sampling.
     */
    protected markIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'path') {
            return this.pathIntersectsRect(node as SVGPathElement, x0, y0, x1, y1);
        }
        return this.nodeIntersectsRect(node, x0, y0, x1, y1);
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
    protected nodeIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
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
        const bboxContained = bx0 >= rx0 && bx1 <= rx1 && by0 >= ry0 && by1 <= ry1;
        if (bboxContained) return true;

        const geomNode = node as any;
        if (typeof geomNode.getTotalLength === 'function' && typeof geomNode.getPointAtLength === 'function') {
            const total = geomNode.getTotalLength() as number;

            if (total > 0) {
                const steps = Math.min(128, Math.max(8, Math.ceil(total / 12)));
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

    /**
     * Tests a path mark against a brush rectangle using parsed polyline segments when possible.
     */
    private pathIntersectsRect(node: SVGPathElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const rx0 = Math.min(x0, x1);
        const rx1 = Math.max(x0, x1);
        const ry0 = Math.min(y0, y1);
        const ry1 = Math.max(y0, y1);
        const points = this.extractPathPoints(node);

        if (points.length >= 2) {
            const pointInRect = (x: number, y: number): boolean =>
                x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;

            const segmentsIntersect = (
                ax: number, ay: number, bx: number, by: number,
                cx: number, cy: number, dx: number, dy: number,
            ): boolean => {
                const orientation = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
                    (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
                const onSegment = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): boolean =>
                    qx >= Math.min(px, rx) && qx <= Math.max(px, rx) && qy >= Math.min(py, ry) && qy <= Math.max(py, ry);

                const o1 = orientation(ax, ay, bx, by, cx, cy);
                const o2 = orientation(ax, ay, bx, by, dx, dy);
                const o3 = orientation(cx, cy, dx, dy, ax, ay);
                const o4 = orientation(cx, cy, dx, dy, bx, by);

                if (o1 === 0 && onSegment(ax, ay, cx, cy, bx, by)) return true;
                if (o2 === 0 && onSegment(ax, ay, dx, dy, bx, by)) return true;
                if (o3 === 0 && onSegment(cx, cy, ax, ay, dx, dy)) return true;
                if (o4 === 0 && onSegment(cx, cy, bx, by, dx, dy)) return true;

                return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
            };

            const segmentIntersectsRect = (ax: number, ay: number, bx: number, by: number): boolean => {
                const sx0 = Math.min(ax, bx);
                const sx1 = Math.max(ax, bx);
                const sy0 = Math.min(ay, by);
                const sy1 = Math.max(ay, by);
                if (sx1 < rx0 || sx0 > rx1 || sy1 < ry0 || sy0 > ry1) {
                    return false;
                }

                return (
                    segmentsIntersect(ax, ay, bx, by, rx0, ry0, rx1, ry0) ||
                    segmentsIntersect(ax, ay, bx, by, rx1, ry0, rx1, ry1) ||
                    segmentsIntersect(ax, ay, bx, by, rx1, ry1, rx0, ry1) ||
                    segmentsIntersect(ax, ay, bx, by, rx0, ry1, rx0, ry0)
                );
            };

            for (let i = 0; i < points.length - 1; i++) {
                const [ax, ay] = points[i];
                const [bx, by] = points[i + 1];
                if (pointInRect(ax, ay) || pointInRect(bx, by)) {
                    return true;
                }
                if (segmentIntersectsRect(ax, ay, bx, by)) {
                    return true;
                }
            }
            return false;
        }

        return this.nodeIntersectsRect(node, x0, y0, x1, y1);
    }

    /**
     * Parses polyline points from an SVG path `d` string when it contains line commands.
     */
    private extractPathPoints(node: SVGPathElement): [number, number][] {
        const d = node.getAttribute('d') ?? '';
        if (!/[MmLlHhVv]/.test(d) || /[CcSsQqTtAa]/.test(d)) {
            return [];
        }

        const tokens = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
        const points: [number, number][] = [];
        let i = 0;
        let cmd = '';
        let currentX = 0;
        let currentY = 0;
        let startX = 0;
        let startY = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            if (/^[MLHVZmlhvz]$/.test(token)) {
                cmd = token;
                i += 1;
                if (cmd === 'Z' || cmd === 'z') {
                    points.push([startX, startY]);
                }
                continue;
            }

            if (cmd === 'M' || cmd === 'L') {
                const x = Number(tokens[i]);
                const y = Number(tokens[i + 1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
                currentX = x;
                currentY = y;
                if (cmd === 'M' && points.length === 0) {
                    startX = x;
                    startY = y;
                    cmd = 'L';
                }
                points.push([currentX, currentY]);
                i += 2;
                continue;
            }

            if (cmd === 'm' || cmd === 'l') {
                const dx = Number(tokens[i]);
                const dy = Number(tokens[i + 1]);
                if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [];
                currentX += dx;
                currentY += dy;
                if (cmd === 'm' && points.length === 0) {
                    startX = currentX;
                    startY = currentY;
                    cmd = 'l';
                }
                points.push([currentX, currentY]);
                i += 2;
                continue;
            }

            if (cmd === 'H') {
                const x = Number(tokens[i]);
                if (!Number.isFinite(x)) return [];
                currentX = x;
                points.push([currentX, currentY]);
                i += 1;
                continue;
            }

            if (cmd === 'h') {
                const dx = Number(tokens[i]);
                if (!Number.isFinite(dx)) return [];
                currentX += dx;
                points.push([currentX, currentY]);
                i += 1;
                continue;
            }

            if (cmd === 'V') {
                const y = Number(tokens[i]);
                if (!Number.isFinite(y)) return [];
                currentY = y;
                points.push([currentX, currentY]);
                i += 1;
                continue;
            }

            if (cmd === 'v') {
                const dy = Number(tokens[i]);
                if (!Number.isFinite(dy)) return [];
                currentY += dy;
                points.push([currentX, currentY]);
                i += 1;
                continue;
            }

            return [];
        }

        return points;
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
     * Applies resolved brush selection, emits the event payload, and refreshes styles.
     */
    private commitBrushSelection(event: ChartEvent, activeBrushes: Map<string, [number, number, number, number]>): void {
        if (activeBrushes.size === 0) {
            this._selectedMarkDatums = new Set();
            this._selectedFeatureIds = new Set();
            this._selectionOrigin = null;
        } else {
            this.resolveSelectionFromRects(activeBrushes);
        }
        this.renderSelection();
        this.events.emit(event, { selection: this.selection });
    }

    /**
     * Resolves the selection projection policy for the current chart config.
     */
    private resolveSelectionProjection(transform: ChartTransformConfig | undefined): 'bijective' | 'aggregated' {
        const preset = transform?.preset;
        if (
            preset === 'binning-1d' ||
            preset === 'binning-2d' ||
            preset === 'binning-events' ||
            preset === 'reduce-series'
        ) {
            return 'aggregated';
        }
        return 'bijective';
    }

    /**
     * Recomputes selected feature ids from the currently selected mark datums.
     */
    private syncSelectedFeaturesFromMarks(): void {
        const fids = new Set<number>();
        for (const datum of this._selectedMarkDatums) {
            const ids = (datum as AutkDatum).autkIds ?? [];
            for (const fid of ids) fids.add(fid);
        }
        this._selectedFeatureIds = fids;
    }

    /**
     * Recomputes selected mark datums from the current selected feature ids.
     */
    private syncSelectedMarksFromFeatures(): void {
        const selectedMarks = new Set<object>();

        if (this._selectedFeatureIds.size === 0) {
            this._selectedMarkDatums = selectedMarks;
            return;
        }

        d3.select(this._div)
            .selectAll('.autkMark')
            .each((d) => {
                if (d == null || typeof d !== 'object') return;
                const ids = (d as AutkDatum).autkIds ?? [];
                if (ids.some(fid => this._selectedFeatureIds.has(fid))) {
                    selectedMarks.add(d as object);
                }
            });

        this._selectedMarkDatums = selectedMarks;
    }
}
