import * as d3 from 'd3';

import type { AutkDatum } from '../types-chart';

import { ChartStyle } from '../chart-style';

import { EventEmitter } from '../types-core';
import type { ChartEventRecord } from '../types-events';

import { ChartEvent } from '../types-events';

import type { ChartTransformConfig } from '../api';


export class InteractionHandler {
    private readonly _div: HTMLElement;
    private readonly _width: number;
    private readonly _height: number;
    private readonly _margins: { left: number; right: number; top: number; bottom: number };

    private _selectedMarkDatums: Set<object> = new Set();
    private _selectedFeatureIds: Set<number> = new Set();
    private _selectionOrigin: 'local' | 'external' | null = null;
    private _selectionProjection: 'bijective' | 'aggregated' = 'bijective';

    private readonly _chartEvents: EventEmitter<ChartEventRecord>;
    private readonly _enabledEvents: ChartEvent[] = [];

    private _activeBrushes: Map<string, [number, number, number, number]> = new Map();
    private _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> = new Map();
    private _suppressBrushEvents: boolean = false;

    private _MODE: 'and' | 'or' = 'and';

    constructor(
        div: HTMLElement,
        width: number,
        height: number,
        margins: { left: number; right: number; top: number; bottom: number },
        events: ChartEvent[],
        chartEvents: EventEmitter<ChartEventRecord>,
        transform: ChartTransformConfig | undefined,
    ) {
        this._div = div;
        this._width = width;
        this._height = height;
        this._margins = margins;
        this._enabledEvents.push(...events);
        this._chartEvents = chartEvents;
        this._selectionProjection = this.resolveSelectionProjection(transform);
    }

    get selection(): number[] {
        return Array.from(this._selectedFeatureIds);
    }

    get data(): AutkDatum[] {
        return [];
    }

    isMarkHighlighted(d: unknown): boolean {
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

    setSelection(selection: number[]): void {
        this._selectedFeatureIds = new Set(selection);
        this._selectionOrigin = selection.length > 0 ? 'external' : null;
        this.syncSelectedMarksFromFeatures();
        if (selection.length === 0) {
            this._activeBrushes.clear();
            this.clearBrushVisuals();
        }
    }

    configureSignalListeners(): void {
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

    renderSelection(): void {
        const svgs = d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark');
        this.applyMarkStyles(svgs);
        this.onSelectionUpdated();
    }

    applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        const handler = this;
        svgs.style('fill', function (d: unknown) {
            if (handler.isMarkHighlighted(d)) {
                return ChartStyle.highlight;
            }
            return '#4682b4';
        });
    }

    onSelectionUpdated(): void {}

    resolveSelectionFromRects(activeBrushes: Map<string, [number, number, number, number]>): number[] {
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

    markIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'path') {
            return this.pathIntersectsRect(node as SVGPathElement, x0, y0, x1, y1);
        }
        return this.nodeIntersectsRect(node, x0, y0, x1, y1);
    }

    resetSelectionState(): void {
        this._selectedMarkDatums = new Set();
        this._selectedFeatureIds = new Set();
        this._selectionOrigin = null;
        this._activeBrushes.clear();
    }

    get colorProperty(): 'fill' | 'stroke' {
        return 'fill';
    }

    private clickEvent(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');
        const handler = this;

        svgs.each(function (d) {
            d3.select(this).on('click', function () {
                if (d == null || typeof d !== 'object') return;
                if (handler._selectedMarkDatums.has(d as object)) {
                    handler._selectedMarkDatums.delete(d as object);
                } else {
                    handler._selectedMarkDatums.add(d as object);
                }
                handler.syncSelectedFeaturesFromMarks();
                handler._selectionOrigin = handler._selectedFeatureIds.size > 0 ? 'local' : null;
                handler.renderSelection();
                handler._chartEvents.emit(ChartEvent.CLICK, { selection: handler.selection });
            });
        });

        cls.on('click', function () {
            handler._selectedMarkDatums = new Set();
            handler._selectedFeatureIds = new Set();
            handler._selectionOrigin = null;
            handler.renderSelection();
            handler._chartEvents.emit(ChartEvent.CLICK, { selection: [] });
        });
    }

    private brushEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const handler = this;

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brush()
                    .extent([[0, 0], [handler._width - handler._margins.left - handler._margins.right, handler._height - handler._margins.top - handler._margins.bottom]])
                    .on("start brush end", function (event: any) {
                        if (handler._suppressBrushEvents) return;
                        if (event.selection) {
                            const [x0, y0] = event.selection[0];
                            const [x1, y1] = event.selection[1];
                            handler._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            handler.resolveSelectionFromRects(handler._activeBrushes);
                            handler.renderSelection();
                            handler._chartEvents.emit(ChartEvent.BRUSH, { selection: handler.selection });
                        } else {
                            handler._activeBrushes.delete(brushKey);
                            handler.commitBrushSelection(ChartEvent.BRUSH, handler._activeBrushes);
                        }
                    });
                handler._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    private brushXEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const handler = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, handler._height - handler._margins.top - handler._margins.bottom]] :
            [[0, 0], [handler._width - handler._margins.left - handler._margins.right, handler._height - handler._margins.top - handler._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushX()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (handler._suppressBrushEvents) return;
                        if (event.selection) {
                            const x0 = event.selection[0];
                            const y0 = -10;
                            const x1 = event.selection[1];
                            const y1 = handler._height;

                            handler._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            handler.resolveSelectionFromRects(handler._activeBrushes);
                            handler.renderSelection();
                            handler._chartEvents.emit(ChartEvent.BRUSH_X, { selection: handler.selection });
                        } else {
                            handler._activeBrushes.delete(brushKey);
                            handler.commitBrushSelection(ChartEvent.BRUSH_X, handler._activeBrushes);
                        }
                    });
                handler._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    private brushYEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrush');
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const handler = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, handler._height - handler._margins.top - handler._margins.bottom]] :
            [[0, 0], [handler._width - handler._margins.left - handler._margins.right, handler._height - handler._margins.top - handler._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const dim = cBrush.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);

                const brush = d3.brushY()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (handler._suppressBrushEvents) return;
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

                            handler._activeBrushes.set(brushKey, [x0, y0, x1, y1]);
                            handler.resolveSelectionFromRects(handler._activeBrushes);
                            handler.renderSelection();
                            handler._chartEvents.emit(ChartEvent.BRUSH_Y, { selection: handler.selection });
                        } else {
                            handler._activeBrushes.delete(brushKey);
                            handler.commitBrushSelection(ChartEvent.BRUSH_Y, handler._activeBrushes);
                        }
                    });
                handler._brushBehaviors.set(brushKey, brush);
                cBrush.call(brush);
            });
    }

    private clearBrushVisuals(): void {
        this._suppressBrushEvents = true;
        const handler = this;
        d3.select(this._div)
            .selectAll<SVGGElement, unknown>('.autkBrush')
            .each(function (_d, i) {
                const el = d3.select<SVGGElement, unknown>(this);
                const dim = el.attr('autkBrushId');
                const brushKey = dim && dim.length > 0 ? dim : String(i);
                const brush = handler._brushBehaviors.get(brushKey);
                if (brush) {
                    brush.move(el, null);
                }
            });
        this._suppressBrushEvents = false;
    }

    private commitBrushSelection(event: ChartEvent, activeBrushes: Map<string, [number, number, number, number]>): void {
        if (activeBrushes.size === 0) {
            this._selectedMarkDatums = new Set();
            this._selectedFeatureIds = new Set();
            this._selectionOrigin = null;
        } else {
            this.resolveSelectionFromRects(activeBrushes);
        }
        this.renderSelection();
        this._chartEvents.emit(event, { selection: this.selection });
    }

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

    private syncSelectedFeaturesFromMarks(): void {
        const fids = new Set<number>();
        for (const datum of this._selectedMarkDatums) {
            const ids = (datum as AutkDatum).autkIds ?? [];
            for (const fid of ids) fids.add(fid);
        }
        this._selectedFeatureIds = fids;
    }

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
                    (qy - py) * (rx - qx) - (qx - px) * (ry - py);
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
}