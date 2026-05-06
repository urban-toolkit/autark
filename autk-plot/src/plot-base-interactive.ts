import * as d3 from 'd3';

import type {
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from './types-plot';
import type { PlotConfig } from './api';

import {
    ColorMapInterpolator,
    ColorMap,
    EventEmitter,
    valueAtPath,
} from './types-core';
import type { PlotEventRecord } from './types-events';

import { PlotStyle } from './plot-style';
import { PlotEvent } from './types-events';
import { PlotBaseData } from './plot-base-data';

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
    /** When false, clicking the plot background does not clear the selection. */
    protected _backgroundClickClearsSelection = true;

    /** Datums corresponding to marks currently selected by local interaction. */
    private _selectedMarkDatums: Set<object> = new Set();
    /** Source feature ids owned by local interaction on this plot. */
    private _selectedFeatureIds: Set<number> = new Set();
    /** Source feature ids highlighted from other coordinated views. */
    private _externalSelectedFeatureIds: Set<number> = new Set();
    /** Typed event emitter exposed to plot consumers. */
    private _plotEvents!: EventEmitter<PlotEventRecord>;
    /** Active brush rectangles keyed by brush host id. */
    private _activeBrushes: Map<string, [number, number, number, number]> = new Map();
    /** Cached brush behaviors used to clear visuals programmatically. */
    private _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> = new Map();
    /** Suppresses brush handlers during programmatic brush clearing. */
    private _suppressBrushEvents: boolean = false;

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
    }

    /**
     * Returns the locally owned selection as source feature ids.
     */
    get selection(): number[] {
        return Array.from(this._selectedFeatureIds);
    }

    /**
     * Returns the full highlighted feature set visible in this view.
     */
    get highlightedSelection(): number[] {
        return Array.from(this.getCombinedSelectedFeatureIds());
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
        this._externalSelectedFeatureIds = new Set();
        this._activeBrushes.clear();
        this.clearBrushVisuals();
        this._brushBehaviors.clear();
        this.draw();
    }

    /**
     * Applies an externally authored highlight set to the plot.
     *
     * @param selection Source feature ids to highlight.
     * @throws Never throws.
     */
    setSelection(selection: number[]): void {
        this._externalSelectedFeatureIds = new Set(selection);
        this.renderSelection();
    }

    /**
     * Replaces the locally owned selection for this plot only.
     *
     * @param selection Source feature ids owned by this plot.
     * @throws Never throws.
     */
    setLocalSelection(selection: number[]): void {
        this._selectedFeatureIds = new Set(selection);
        this.syncSelectedMarksFromLocalFeatures();
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
     * Attaches interaction handlers requested by the plot configuration.
     *
     * @throws Never throws.
     */
    public configureSignalListeners(): void {
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
            return PlotStyle.highlight;
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

        const datum = d as AutkDatum;

        const combinedIds = this.getCombinedSelectedFeatureIds();
        return combinedIds.size > 0 && (datum.autkIds ?? []).some(fid => combinedIds.has(fid));
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
                plot.renderSelection();
                plot.events.emit(PlotEvent.CLICK, { selection: plot.selection });
            });
        });

        if (this._backgroundClickClearsSelection) {
            cls.on('click', function () {
                plot.setLocalSelection([]);
                plot.events.emit(PlotEvent.CLICK, { selection: [] });
            });
        }
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
                            plot.events.emit(PlotEvent.BRUSH, { selection: plot.selection });
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
                            plot.events.emit(PlotEvent.BRUSH_X, { selection: plot.selection });
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
                            plot.events.emit(PlotEvent.BRUSH_Y, { selection: plot.selection });
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
        if (this._selectedFeatureIds.size === 0) {
            return;
        }
        this.syncSelectedMarksFromLocalFeatures();
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
        } else {
            this.resolveSelectionFromRects(activeBrushes);
        }
        this.renderSelection();
        this.events.emit(event, { selection: this.selection });
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
     * Rebuilds the locally selected mark set from the current selected source feature ids.
     */
    private syncSelectedMarksFromLocalFeatures(): void {
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

    /**
     * Returns the union of local and externally provided feature ids.
     */
    private getCombinedSelectedFeatureIds(): Set<number> {
        return new Set([...this._selectedFeatureIds, ...this._externalSelectedFeatureIds]);
    }
}
