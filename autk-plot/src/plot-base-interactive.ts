import * as d3 from 'd3';

import type {
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from './types-plot';
import type { PlotConfig, PlotTransformConfig } from './api';

import {
    ColorMapInterpolator,
    ColorMap,
    EventEmitter,
    valueAtPath,
} from '@urban-toolkit/autk-core';
import type { PlotEventRecord } from './types-events';

import { PlotStyle } from './plot-style';
import { PlotEvent } from './types-events';
import { PlotBaseData } from './plot-base-data';

import type { PlotEventData } from './types-events';
import type { FeatureShare, MarkContribution, ProvenanceId, ProvenancePath } from './types-provenance';
import { markId } from './provenance';
import { renderProvenancePathView } from './provenance/path-view';
import { othersLabelOf } from './transforms/top-k';

/**
 * Part of a rendered mark produced by the selected features (segregated view).
 */
export type SegregatedPart = {
    /** Rendered row bound to the mark. */
    datum: AutkDatum;
    /** Mark id of the rendered row. */
    mark: ProvenanceId;
    /** Contribution of the selected features to the row. */
    part: MarkContribution;
    /**
     * Fraction of the mark to fill, in `[0, 1]`: selected value over row value
     * for additive reducers, selected units over row units otherwise.
     */
    fraction: number;
};

/**
 * Plot drawn last in each host element. A plot replaced in its host stops
 * following the host size, so it never draws over the new one.
 */
const hostOwners = new WeakMap<HTMLElement, PlotBaseInteractive>();

/**
 * Interactive plot base class.
 *
 * Extends `PlotBaseData` with selection state, click/brush wiring, and mark
 * highlighting behavior shared by interactive plots.
 */
export abstract class PlotBaseInteractive extends PlotBaseData {
    /** Interaction events explicitly enabled for the plot instance. */
    protected _enabledEvents: PlotEvent[] = [];
    /** CSS property used when applying colors to marks. */
    protected _colorProperty: 'fill' | 'stroke' = 'fill';

    /** Datums corresponding to marks currently selected by local interaction. */
    private _selectedMarkDatums: Set<object> = new Set();
    /** Source feature ids derived from mark selection or provided externally. */
    private _selectedFeatureIds: Set<number> = new Set();
    /** Tracks whether the current selection came from local or external input. */
    private _selectionOrigin: 'local' | 'external' | null = null;
    /** Controls how source ids map back onto rendered marks. */
    private _selectionProjection: 'bijective' | 'aggregated' = 'bijective';
    /** Typed event emitter exposed to plot consumers. */
    private _plotEvents!: EventEmitter<PlotEventRecord>;
    /** Active brush rectangles keyed by brush host id. */
    private _activeBrushes: Map<string, [number, number, number, number]> = new Map();
    /** Cached brush behaviors used to clear visuals programmatically. */
    private _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> = new Map();
    /** Suppresses brush handlers during programmatic brush clearing. */
    private _suppressBrushEvents: boolean = false;
    /** Feature shares received with the last external selection, keyed by feature index. */
    private _selectionShares: Map<number, FeatureShare> | null = null;
    /** Whether the provenance path widget was requested (`provenance.path`). */
    private _pathView: boolean = true;
    /** Whether the provenance path widget is expanded. */
    private _pathOpen: boolean = false;
    /** Observer of the host size with `width: 'auto'`. */
    private _resizeObserver: ResizeObserver | null = null;

    /**
     * Brush combine mode for multi-brush interactions.
     *
     * `and` requires all active brushes to contain a mark; `or` allows any
     * brush to include it.
     */
    protected _MODE: 'and' | 'or' = 'and';

    /**
     * Initializes interactive plot state on top of the shared data lifecycle.
     *
     * @param config Plot configuration including optional interaction events.
     * @throws If configured bindings are missing or invalid (delegated to `PlotBaseData`).
     */
    constructor(config: PlotConfig) {
        super(config);
        this._plotEvents = new EventEmitter();
        this._enabledEvents = config.events ?? [];
        this._selectionProjection = this.resolveSelectionProjection(config.transform, config.topK ? othersLabelOf(config.topK) !== null : false);
        this._pathView = config.provenance?.path === true || config.provenance?.path === 'open';
        this._pathOpen = config.provenance?.path === 'open';
        hostOwners.set(this._div, this);
    }

    /**
     * Stops following the host size and removes the plot from its host.
     *
     * @throws Never throws.
     */
    public destroy(): void {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        if (hostOwners.get(this._div) === this) {
            hostOwners.delete(this._div);
            this._div.replaceChildren();
        }
    }

    /**
     * Redraws at the host width whenever it changes (`width: 'auto'`), at most
     * once per frame. Starts after the first successful draw, so a plot whose
     * constructor throws leaves nothing behind. Without `ResizeObserver` the
     * plot keeps its first width.
     */
    private followHostWidth(): void {
        if (!this._autoWidth || this._resizeObserver || hostOwners.get(this._div) !== this) return;
        if (typeof ResizeObserver === 'undefined') return;
        let frame = 0;
        this._resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => this.resizeToHost());
        });
        this._resizeObserver.observe(this._div);
    }

    /**
     * Redraws at the new host width and keeps the selection. Brush rectangles
     * are cleared, since their pixels no longer match the new scales; the
     * features they selected stay selected. A host without layout (hidden, e.g.
     * in a closed tab) is skipped: the plot keeps its drawing until it shows again.
     */
    private resizeToHost(): void {
        if (hostOwners.get(this._div) !== this) {
            this.destroy();
            return;
        }
        if (this._div.clientWidth === 0 || this.hostWidth() === this._width) return;
        this.clearBrushVisuals();
        this._activeBrushes.clear();
        this.draw();
        this.syncSelectedMarksFromFeatures();
        this.renderSelection();
    }

    /**
     * Returns the active selection as source feature ids.
     */
    get selection(): number[] {
        return Array.from(this._selectedFeatureIds);
    }

    /**
     * Returns the typed event emitter used by this plot instance.
     */
    get events(): EventEmitter<PlotEventRecord> {
        return this._plotEvents;
    }

    /**
     * Replaces the source collection, clears interaction state, and redraws.
     *
     * @param collection New GeoJSON collection to render.
     * @throws Never throws.
     */
    updateCollection(collection: import('geojson').FeatureCollection<Geometry, GeoJsonProperties>): void {
        this._sourceFeatures = collection.features;
        this._selectedMarkDatums = new Set();
        this._selectedFeatureIds = new Set();
        this._selectionOrigin = null;
        this._selectionShares = null;
        this._activeBrushes.clear();
        this.clearBrushVisuals();
        this._brushBehaviors.clear();
        this.draw();
    }

    /**
     * Applies an externally authored selection to the plot.
     *
     * @param selection Source feature ids to highlight.
     * @param shares Optional share of each feature covered by the selection in
     * the emitting view; one-to-one plots draw only that part of each mark.
     * @throws Never throws.
     */
    setSelection(selection: number[], shares?: FeatureShare[]): void {
        this._selectionShares = shares ? new Map(shares.map(share => [share.feature, share])) : null;
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
     * Rehydrates local aggregated mark selection after `_data` is rebuilt.
     */
    protected override afterDataRefresh(): void {
        this.restoreLocalSelectionAfterDraw();
    }

    /**
     * Registers the rendered `.autkMark` nodes as provenance stage `M` and
     * redraws segregated marks for the new geometry.
     */
    protected override afterRender(): void {
        const marks = d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark');
        const rowIds: ProvenanceId[] = [];
        marks.each((d) => {
            const id = this.rowIdOf(d);
            if (id) rowIds.push(id);
        });
        this._provenance.registerMarks(rowIds);

        marks.attr('data-autk-provenance', (d) => {
            const id = this.rowIdOf(d);
            return id ? markId(id) : null;
        });
        this.renderSegregatedMarks();
        this.renderProvenancePath();
        this.followHostWidth();
    }

    /**
     * Provenance path of the current selection.
     *
     * A local selection starts at the selected marks and goes back to the
     * source features (inverse query). A selection from another view starts at
     * the selected features and goes forward to the marks (direct query).
     *
     * @returns Query direction and reached stages, or `null` without a selection.
     */
    get selectionPath(): { direction: 'direct' | 'inverse'; path: ProvenancePath } | null {
        if (this._selectedFeatureIds.size === 0 || this._selectionOrigin === null) return null;

        if (this._selectionOrigin === 'local') {
            const marks: ProvenanceId[] = [];
            for (const datum of this._selectedMarkDatums) {
                const id = this.rowIdOf(datum);
                if (id) marks.push(markId(id));
            }
            if (marks.length > 0) return { direction: 'inverse', path: this._provenance.inverse(marks) };
        }
        return { direction: 'direct', path: this._provenance.direct(this.selection) };
    }

    /**
     * Draws, updates, or removes the provenance path widget under the plot.
     */
    protected renderProvenancePath(): void {
        if (!this._pathView || !this.segregatedEnabled || !this._provenance) {
            renderProvenancePathView(this._div, null);
            return;
        }

        const selected = this.selectionPath;
        const cardinalities = new Map(this._provenance.cardinalities.map(c => [`${c.source}→${c.target}`, c.cardinality]));
        // Mark parts by readable label (axis[0] of the row), at most three plus a count of the rest.
        const segregated = this.segregatedParts();
        const partLabel = (datum: AutkDatum, mark: ProvenanceId) => {
            const label = valueAtPath(datum, this.renderAxisAttributes[0]);
            if (typeof label === 'number' && Number.isFinite(label)) return d3.format('~s')(label);
            return typeof label === 'string' && label.length > 0 ? label : mark;
        };
        // Fractional coverage (density) gives real unit weights: at most two decimals.
        const units = d3.format('.2~f');
        const parts = segregated.slice(0, 3).map(p => `${partLabel(p.datum, p.mark)}: ${units(p.part.selectedUnits)}/${units(p.part.totalUnits)}`);
        if (segregated.length > 3) parts.push(`+${segregated.length - 3}`);

        // Explain entities the selection loses at stages with a note (filter, top-k).
        const path = selected?.path ?? [];
        const notes = path.flatMap((step, index) => {
            if (!step.dropped || !step.note) return [];
            const label = path[index - 1]?.label ?? 'entities';
            const noun = step.dropped === 1 ? label.replace(/s$/, '') : label;
            return [`${step.dropped} ${noun} excluded at ${step.stage} — ${step.note}`];
        });

        renderProvenancePathView(this._div, {
            open: this._pathOpen,
            direction: selected?.direction ?? null,
            path,
            cardinalities,
            parts,
            notes,
            width: this._width,
            onToggle: () => {
                this._pathOpen = !this._pathOpen;
                this.renderProvenancePath();
            },
        });
    }

    /** Whether rendered rows aggregate features (`aggregated` projection) rather than being one per feature. */
    protected get aggregatesRows(): boolean {
        return this._selectionProjection === 'aggregated';
    }

    /**
     * Whether the plot draws the segregated view, regardless of the current
     * selection. Plots may use it to lay out scales that fit partial marks.
     */
    protected get segregatedEnabled(): boolean {
        return this.supportsSegregatedView();
    }

    /**
     * Highlight color of the plot: the provenance color for plots with the
     * segregated view, the plain highlight color for plots without it.
     */
    protected get highlightColor(): string {
        return this.segregatedEnabled ? PlotStyle.provenance : PlotStyle.highlight;
    }

    /**
     * Whether marks currently show only their selected part (segregated view).
     *
     * Requires the view to be enabled and supported by the plot, and a
     * selection that came from another view: aggregated rows split by the
     * selected features (direct direction), or one-to-one rows split by the
     * feature shares sent along with the selection (inverse direction). A local
     * selection picks whole marks, so it keeps the whole-mark highlight.
     */
    protected get segregatedActive(): boolean {
        if (!this.segregatedEnabled) return false;
        if (this._selectionOrigin !== 'external' || this._selectedFeatureIds.size === 0) return false;
        return this._selectionProjection === 'aggregated' || this._selectionShares !== null;
    }

    /**
     * Builds the event payload for the current selection.
     *
     * Aggregating plots add the share of each selected feature covered by the
     * selected marks, so receiving one-to-one plots can split their marks.
     *
     * @returns Selected source ids, plus shares when rows are aggregated.
     */
    protected selectionEventData(): PlotEventData {
        // Without the segregated view, or for one-to-one rows, the payload is the selection alone.
        if (!this.segregatedEnabled || this._selectionProjection !== 'aggregated' || this._selectionOrigin !== 'local') {
            return { selection: this.selection };
        }

        const rowIds: ProvenanceId[] = [];
        for (const datum of this._selectedMarkDatums) {
            const id = this.rowIdOf(datum);
            if (id) rowIds.push(id);
        }
        return { selection: this.selection, shares: this._provenance.featureShares(rowIds) };
    }

    /**
     * Whether the plot draws segregated marks. Plots opt in by overriding.
     *
     * @returns `true` when `renderSegregatedMarks()` is implemented for the current configuration.
     */
    protected supportsSegregatedView(): boolean {
        return false;
    }

    /**
     * Draws, updates, or clears the partial marks of the segregated view from
     * `segregatedSelection`. Plots that support the view override this hook.
     */
    protected renderSegregatedMarks(): void {}

    /**
     * Part of each rendered row produced by the current external selection.
     *
     * Aggregated rows use the contribution of the selected features. One-to-one
     * rows use the feature shares received with the selection.
     *
     * @returns One entry per row that receives at least one selected unit, or
     * an empty list when the segregated view is inactive.
     */
    protected segregatedParts(): SegregatedPart[] {
        if (!this.segregatedActive) return [];

        const parts: SegregatedPart[] = [];
        for (const datum of this._data) {
            const rowId = this.rowIdOf(datum);
            if (!rowId) continue;

            let part: MarkContribution;
            if (this._selectionProjection === 'aggregated') {
                part = this._provenance.contribution(rowId, this._selectedFeatureIds);
            } else {
                const share = this._selectionShares?.get(datum.autkIds?.[0] ?? -1);
                if (!share) continue;
                part = {
                    selectedUnits: share.selectedUnits,
                    totalUnits: share.totalUnits,
                    value: share.selectedUnits,
                    totalValue: share.totalUnits,
                    additive: true,
                };
            }
            if (part.value === null) continue;

            const ratio = part.additive && part.totalValue
                ? (part.value ?? 0) / part.totalValue
                : part.selectedUnits / part.totalUnits;
            parts.push({ datum, mark: markId(rowId), part, fraction: Math.min(1, Math.max(0, ratio)) });
        }
        return parts;
    }

    /**
     * Attaches interaction handlers requested by the plot configuration.
     *
     * @throws Never throws.
     */
    public configureSignalListeners(): void {
        this.configureTouchInteractionStyles();

        for (const event of this._enabledEvents) {
            if (event === PlotEvent.CLICK) {
                this.clickEvent();
            } else if (event === PlotEvent.BRUSH) {
                this.brushEvent();
            } else if (event === PlotEvent.BRUSH_X) {
                this.brushXEvent();
            } else if (event === PlotEvent.BRUSH_Y) {
                this.brushYEvent();
            }
        }
    }

    /**
     * Prevents browser touch gestures from stealing plot interactions.
     */
    protected configureTouchInteractionStyles(): void {
        const root = d3.select(this._div);
        root.selectAll<SVGSVGElement, unknown>('svg').style('touch-action', 'none');
        root.selectAll<SVGGElement, unknown>('.autkBrush, .autkMarksGroup').style('touch-action', 'none');
        root.selectAll<SVGRectElement, unknown>('.autkClear').style('touch-action', 'none');
    }

    /**
     * Resolves the color for a rendered mark datum.
     *
     * Selection highlight takes precedence over data-driven color encoding.
     *
     * @param d Bound datum for the mark.
     * @returns CSS color string for the mark.
     */
    protected getMarkColor(d: unknown): string {
        const datum = d as AutkDatum;

        if (this.isMarkHighlighted(d)) {
            return this.highlightColor;
        }

        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute || !this._resolvedDomain) {
            return PlotStyle.default;
        }

        if (typeof this._resolvedDomain[0] === 'string') {
            const categories = this._resolvedDomain as string[];
            const rawValue = valueAtPath(datum, colorAttribute);
            if (rawValue === null || rawValue === undefined) {
                return PlotStyle.default;
            }

            const rawVal = String(rawValue);
            const idx = categories.indexOf(rawVal);
            if (idx < 0) {
                return PlotStyle.default;
            }

            const t = categories.length <= 1 ? 0.5 : Math.max(0, idx) / (categories.length - 1);
            const interpolator = this._categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;
            const { r, g, b } = ColorMap.getColor(t, interpolator, categories);
            return `rgb(${r},${g},${b})`;
        }

        const rawValue = valueAtPath(datum, colorAttribute);
        const rawVal = Number(rawValue);
        if (rawValue === null || rawValue === undefined || !Number.isFinite(rawVal)) {
            return PlotStyle.default;
        }

        const numDomain = this._resolvedDomain as [number, number] | [number, number, number];
        const interpolator = this._colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
        const { r, g, b } = ColorMap.getColor(rawVal, interpolator, numDomain);
        return `rgb(${r},${g},${b})`;
    }

    /**
     * Returns whether a rendered mark should be highlighted.
     *
     * @param d Bound datum for the mark.
     * @returns `true` when the mark belongs to the active selection.
     */
    protected isMarkHighlighted(d: unknown): boolean {
        if (d == null || typeof d !== 'object') return false;

        // The segregated view highlights only the selected part, drawn separately.
        if (this.segregatedActive) return false;

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
     * Enables click-based selection for `.autkMark` nodes and clear overlays.
     */
    protected clickEvent(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');
        const plot = this;

        svgs.each(function (d) {
            d3.select(this).on('click', function () {
                if (d == null || typeof d !== 'object') return;
                if (plot._selectedMarkDatums.has(d as object)) {
                    plot._selectedMarkDatums.delete(d as object);
                } else {
                    plot._selectedMarkDatums.add(d as object);
                }
                plot.syncSelectedFeaturesFromMarks();
                plot._selectionOrigin = plot._selectedFeatureIds.size > 0 ? 'local' : null;
                plot.renderSelection();
                plot.events.emit(PlotEvent.CLICK, plot.selectionEventData());
            });
        });

        cls.on('click', function () {
            plot._selectedMarkDatums = new Set();
            plot._selectedFeatureIds = new Set();
            plot._selectionOrigin = null;
            plot.renderSelection();
            plot.events.emit(PlotEvent.CLICK, { selection: [] });
        });
    }

    /**
     * Enables 2D rectangular brushing interactions.
     */
    protected brushEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const plot = this;

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brush()
                    .extent([[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]])
                    .on('start brush end', function (event: any) {
                        if (plot._suppressBrushEvents) return;
                        if (event.selection) {
                            const [x0, y0] = event.selection[0];
                            const [x1, y1] = event.selection[1];
                            plot._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            plot.resolveSelectionFromRects(plot._activeBrushes);
                            plot.renderSelection();
                            plot.events.emit(PlotEvent.BRUSH, plot.selectionEventData());
                        } else {
                            plot._activeBrushes.delete(brushKey);
                            plot.commitBrushSelection(PlotEvent.BRUSH, plot._activeBrushes);
                        }
                    });
                plot._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Enables horizontal brushing interactions.
     */
    protected brushXEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const plot = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1)
            ? [[-10, 0], [10, plot._height - plot._margins.top - plot._margins.bottom]]
            : [[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushX()
                    .extent(extent)
                    .on('start brush end', function (event: any) {
                        if (plot._suppressBrushEvents) return;
                        if (event.selection) {
                            const x0 = event.selection[0];
                            const y0 = -10;
                            const x1 = event.selection[1];
                            const y1 = plot._height;

                            plot._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            plot.resolveSelectionFromRects(plot._activeBrushes);
                            plot.renderSelection();
                            plot.events.emit(PlotEvent.BRUSH_X, plot.selectionEventData());
                        } else {
                            plot._activeBrushes.delete(brushKey);
                            plot.commitBrushSelection(PlotEvent.BRUSH_X, plot._activeBrushes);
                        }
                    });
                plot._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Enables vertical brushing interactions.
     */
    protected brushYEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const plot = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1)
            ? [[-10, 0], [10, plot._height - plot._margins.top - plot._margins.bottom]]
            : [[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushY()
                    .extent(extent)
                    .on('start brush end', function (event: any) {
                        if (plot._suppressBrushEvents) return;
                        if (event.selection) {
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

                            plot._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            plot.resolveSelectionFromRects(plot._activeBrushes);
                            plot.renderSelection();
                            plot.events.emit(PlotEvent.BRUSH_Y, plot.selectionEventData());
                        } else {
                            plot._activeBrushes.delete(brushKey);
                            plot.commitBrushSelection(PlotEvent.BRUSH_Y, plot._activeBrushes);
                        }
                    });
                plot._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    /**
     * Refreshes rendered marks to reflect the current selection state.
     */
    protected renderSelection(): void {
        const svgs = d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark');
        this.applyMarkStyles(svgs);
        this.renderSegregatedMarks();
        this.renderProvenancePath();
        this.onSelectionUpdated();
    }

    /**
     * Applies interaction-aware styling to rendered marks.
     *
     * @param svgs Selection containing rendered mark nodes.
     */
    protected applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        svgs.style(this._colorProperty, (d: unknown) => this.getMarkColor(d));
    }

    /**
     * Hook invoked after mark selection styles have been refreshed.
     */
    protected onSelectionUpdated(): void {}

    /**
     * Resolves selected source ids by testing rendered marks against brush rectangles.
     *
     * @param activeBrushes Active brush rectangles keyed by brush host id.
     * @returns Selected source feature ids.
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
     * Tests whether a rendered mark intersects the supplied brush rectangle.
     *
     * @param node SVG geometry node representing the mark.
     * @param x0 First rectangle x coordinate.
     * @param y0 First rectangle y coordinate.
     * @param x1 Second rectangle x coordinate.
     * @param y1 Second rectangle y coordinate.
     * @returns `true` when the mark intersects the rectangle.
     */
    protected markIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'path') {
            return this.pathIntersectsRect(node as SVGPathElement, x0, y0, x1, y1);
        }
        return this.nodeIntersectsRect(node, x0, y0, x1, y1);
    }

    /**
     * Tests a generic SVG geometry node against a brush rectangle.
     *
     * @param node SVG geometry node representing the mark.
     * @param x0 First rectangle x coordinate.
     * @param y0 First rectangle y coordinate.
     * @param x1 Second rectangle x coordinate.
     * @param y1 Second rectangle y coordinate.
     * @returns `true` when the node intersects the rectangle.
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
     * Restores locally selected aggregated marks after transformed rows are recreated.
     */
    private restoreLocalSelectionAfterDraw(): void {
        if (this._selectionProjection !== 'aggregated' || this._selectionOrigin !== 'local') {
            return;
        }

        const selectedMarks = new Set<object>();
        for (const datum of this._data) {
            const ids = datum.autkIds ?? [];
            if (ids.some(fid => this._selectedFeatureIds.has(fid))) {
                selectedMarks.add(datum as object);
            }
        }
        this._selectedMarkDatums = selectedMarks;
    }

    /**
     * Tests whether an SVG path intersects the supplied brush rectangle.
     *
     * @param node SVG path node representing the mark.
     * @param x0 First rectangle x coordinate.
     * @param y0 First rectangle y coordinate.
     * @param x1 Second rectangle x coordinate.
     * @param y1 Second rectangle y coordinate.
     * @returns `true` when the path intersects the rectangle.
     */
    private pathIntersectsRect(node: SVGPathElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const rx0 = Math.min(x0, x1);
        const rx1 = Math.max(x0, x1);
        const ry0 = Math.min(y0, y1);
        const ry1 = Math.max(y0, y1);
        const points = this.extractPathPoints(node);

        if (points.length >= 2) {
            const pointInRect = (x: number, y: number): boolean => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;

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
     * Extracts polyline points from a path `d` string when it only contains line commands.
     *
     * @param node SVG path node to inspect.
     * @returns Parsed polyline points, or an empty array when unsupported.
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
     * Clears all brush visuals without emitting brush events.
     */
    private clearBrushVisuals(): void {
        this._suppressBrushEvents = true;
        const plot = this;
        d3.select(this._div)
            .selectAll<SVGGElement, unknown>('.autkBrush')
            .each(function (_d, i) {
                const el = d3.select<SVGGElement, unknown>(this);
                const dim = el.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);
                const brush = plot._brushBehaviors.get(brushKey);
                if (brush) {
                    brush.move(el, null);
                }
            });
        this._suppressBrushEvents = false;
    }

    /**
     * Finalizes brush selection state and emits the corresponding interaction event.
     *
     * @param event Interaction event emitted after the brush commit.
     * @param activeBrushes Currently active brush rectangles.
     */
    private commitBrushSelection(event: PlotEvent, activeBrushes: Map<string, [number, number, number, number]>): void {
        if (activeBrushes.size === 0) {
            this._selectedMarkDatums = new Set();
            this._selectedFeatureIds = new Set();
            this._selectionOrigin = null;
        } else {
            this.resolveSelectionFromRects(activeBrushes);
        }
        this.renderSelection();
        this.events.emit(event, this.selectionEventData());
    }

    /**
     * Resolves whether this plot should use bijective or aggregated selection projection.
     *
     * @param transform Optional transform configuration for the plot.
     * @param gathersRows Whether a top-k cut gathers remaining rows into one aggregated row.
     * @returns Selection projection mode used by interaction logic.
     */
    private resolveSelectionProjection(transform: PlotTransformConfig | undefined, gathersRows: boolean = false): 'bijective' | 'aggregated' {
        const preset = transform?.preset;
        if (
            preset === 'binning-1d' ||
            preset === 'binning-2d' ||
            preset === 'binning-events' ||
            preset === 'reduce-series' ||
            preset === 'box-stats' ||
            preset === 'flows' ||
            preset === 'binning-hex' ||
            preset === 'hierarchy' ||
            preset === 'cumulative' ||
            preset === 'fold' ||
            preset === 'density' ||
            preset === 'registered' ||
            gathersRows
        ) {
            return 'aggregated';
        }
        return 'bijective';
    }

    /**
     * Rebuilds the selected source feature id set from the currently selected marks.
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
     * Rebuilds the selected mark set from the current selected source feature ids.
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
