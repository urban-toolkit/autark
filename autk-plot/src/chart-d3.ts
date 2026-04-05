import * as d3 from 'd3';

import { BaseChart } from './base-chart';

import type { ChartConfig } from './api';
import { ChartEvent } from './events-types';
import { ChartStyle } from './chart-style';

/**
 * Base class for D3-driven chart implementations.
 *
 * Provides shared interaction wiring, selection resolution, and mark styling
 * behavior for SVG/HTML charts that use D3 selections.
 *
 * Subclasses are expected to render marks with `.autkMark` and, when brushing
 * is enabled, expose brush hosts using `.autkBrush` plus `.autkMarksGroup`.
 */
export abstract class ChartD3 extends BaseChart {
    /** Active 2D brush rectangles keyed by brush id. */
    protected _activeBrushes: Map<string, [number, number, number, number]> = new Map();
    /** Active horizontal brush rectangles keyed by brush id. */
    protected _activeBrushesX: Map<string, [number, number, number, number]> = new Map();
    /** Active vertical brush rectangles keyed by brush id. */
    protected _activeBrushesY: Map<string, [number, number, number, number]> = new Map();

    /**
     * Builds a D3 chart from generic plot configuration.
     * @param config Plot configuration for this chart instance.
     */
    constructor(config: ChartConfig) {
        super(config);
    }

    /**
     * Attaches only the interaction handlers requested in the event config.
     *
        * Handlers are attached after marks/brush hosts are present in the DOM,
        * typically at the end of `render()` in subclasses.
     */
    configureSignalListeners(): void {
        const enabledEvents = this.enabledEvents;

        for (const event of enabledEvents) {
            if (event === ChartEvent.CLICK) {
                this.clickEvent();
            }
            if (event === ChartEvent.BRUSH) {
                this.brushEvent();
            }
            if (event === ChartEvent.BRUSH_X) {
                this.brushXEvent();
            }
            if (event === ChartEvent.BRUSH_Y) {
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
                        chart.toggleSelectionByDatum(d);

                        chart.events.emit(ChartEvent.CLICK, { selection: chart.selection });
                        chart.updateChartSelection();
                    });
            });

        cls
            .on('click', function () {
                chart.selection = [];

                chart.events.emit(ChartEvent.CLICK, { selection: [] });
                chart.updateChartSelection();
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
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');

        const chart = this;

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const brushKey = chart.getBrushKey(cBrush, i);

                const brush = d3.brush()
                    .extent([[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]])
                    .on("start brush end", function (event: any) {
                        if (event.selection) {
                            const [x0, y0] = event.selection[0];
                            const [x1, y1] = event.selection[1];
                            const [shiftX, shiftY] = chart.getTransformShift(cBrush, marksGroup);

                            chart._activeBrushes.set(brushKey, [x0 + shiftX, y0 + shiftY, x1 + shiftX, y1 + shiftY]);
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushes, ChartEvent.BRUSH);
                            chart.events.emit(ChartEvent.BRUSH, { selection: chart.selection });
                            chart.updateChartSelection();
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
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');

        const chart = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, chart._height - chart._margins.top - chart._margins.bottom]] :
            [[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]];

        brushable
            .each(function (_d, i) {
                const cBrush = d3.select<SVGGElement, unknown>(this);
                const brushKey = chart.getBrushKey(cBrush, i);

                const brush = d3.brushX()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (event.selection) {
                            const [shiftX, shiftY] = chart.getTransformShift(cBrush, marksGroup);

                            const x0 = event.selection[0] + shiftX;
                            const y0 = -10 + shiftY;
                            const x1 = event.selection[1] + shiftX;
                            const y1 = chart._height + shiftY;

                            chart._activeBrushesX.set(brushKey, [x0, y0, x1, y1]);
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushesX, ChartEvent.BRUSH_X);
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: chart.selection });
                            chart.updateChartSelection();
                        } else {
                            chart._activeBrushesX.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_X, chart._activeBrushesX);
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
                const brushKey = chart.getBrushKey(cBrush, i);

                const brush = d3.brushY()
                    .extent(extent)
                    .on("start brush end", function (event: any) {
                        if (event.selection) {
                            const [shiftX, shiftY] = chart.getTransformShift(cBrush, marksGroup);

                            const extWidth = 10;
                            const x0 = shiftX - extWidth;
                            const y0 = event.selection[0] + shiftY;
                            const x1 = shiftX + extWidth;
                            const y1 = event.selection[1] + shiftY;

                            chart._activeBrushesY.set(brushKey, [x0, y0, x1, y1]);
                            chart.selection = chart.resolveSelectionFromRects(chart._activeBrushesY, ChartEvent.BRUSH_Y);
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.selection });
                            chart.updateChartSelection();
                        } else {
                            chart._activeBrushesY.delete(brushKey);
                            chart.applyBrushSelection(ChartEvent.BRUSH_Y, chart._activeBrushesY);
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Returns how multiple active brushes are combined.
     *
     * Override when a chart requires `or` semantics for a specific event.
     * @param _event Event type being resolved.
     * @returns Combination mode for multi-brush resolution.
     */
    protected getBrushCombineMode(_event: ChartEvent): 'and' | 'or' {
        return 'and';
    }

    /**
     * Applies selection styles to mark elements.
     *
     * Override in subclasses that use a different visual encoding
     * (e.g. stroke-based marks, opacity, raise).
    * @param svgs Selection containing mark nodes.
     */
    protected applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        svgs.style('fill', (d: unknown) => {
            if (this.isDatumSelected(d)) {
                return ChartStyle.highlight;
            } else {
                return ChartStyle.default;
            }
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
    updateChartSelection(): void {
        const svgs = d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark');
        this.applyMarkStyles(svgs);
        this.onSelectionUpdated();
    }

    /**
     * Toggles all source ids represented by the given datum.
        * @param datum Mark datum carrying `autkIds`.
     */
    protected toggleSelectionByDatum(datum: unknown): void {
        const ids = this.getDatumAutkIds(datum);
        if (ids.length === 0) return;

        const next = new Set(this.selection);
        const isFullySelected = ids.every((id) => next.has(id));

        if (isFullySelected) {
            ids.forEach((id) => next.delete(id));
        } else {
            ids.forEach((id) => next.add(id));
        }

        this.selection = Array.from(next);
    }

    /**
     * Returns whether any source id represented by the datum is selected.
     * @param datum Mark datum carrying `autkIds`.
     * @returns `true` when at least one represented source id is selected.
     */
    protected isDatumSelected(datum: unknown): boolean {
        const ids = this.getDatumAutkIds(datum);
        return ids.some((id) => this.selection.includes(id));
    }

    /**
     * Resolves selection ids from active brush rectangles.
     *
     * Each `.autkMark` geometry is tested against every active rectangle and
     * included according to the current combine mode (`and` / `or`).
     *
     * @param activeBrushes Active brush rectangles keyed by brush id.
     * @param event Event type driving the resolution.
     * @returns Source ids represented by marks that satisfy brush predicates.
     */
    private resolveSelectionFromRects(activeBrushes: Map<string, [number, number, number, number]>, event: ChartEvent): number[] {
        const rects = Array.from(activeBrushes.values());
        if (rects.length === 0) {
            return [];
        }

        const mode = this.getBrushCombineMode(event);
        const marksGroup = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const nextSel = new Set<number>();

        marksGroup.selectAll('.autkMark')
            .each((d, id: number, nodes) => {
                const node = nodes[id] as SVGGeometryElement | null;
                if (!node) return;

                const hits = rects.map(([x0, y0, x1, y1]) => this.nodeIntersectsRect(node, x0, y0, x1, y1));
                const selected = (mode === 'and') ? hits.every(Boolean) : hits.some(Boolean);

                if (selected) {
                    this.getDatumAutkIds(d).forEach((sourceId) => nextSel.add(sourceId));
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
        const selection = activeBrushes.size === 0 ? [] : this.resolveSelectionFromRects(activeBrushes, event);
        this.selection = selection;
        this.events.emit(event, { selection: this.selection });
        this.updateChartSelection();
    }

    /**
     * Returns a stable brush key from element attributes or loop index fallback.
     * @param cBrush Brush host selection.
     * @param fallbackIndex Index-based fallback key.
     * @returns Stable brush key.
     */
    private getBrushKey(cBrush: d3.Selection<SVGGElement, unknown, any, unknown>, fallbackIndex: number): string {
        const dim = cBrush.attr('autkBrushId');
        return dim && dim.length > 0 ? dim : String(fallbackIndex);
    }

    /**
     * Computes translation delta from brush coordinates into marks-group coordinates.
     * @param cBrush Brush host selection.
     * @param marksGroup Marks group selection.
     * @returns `[shiftX, shiftY]` translation delta.
     */
    private getTransformShift(
        cBrush: d3.Selection<SVGGElement, unknown, any, unknown>,
        marksGroup: d3.Selection<SVGGElement, unknown, any, unknown>,
    ): [number, number] {
        const [cX, cY] = this.readTranslate(cBrush.attr('transform'));
        const [mX, mY] = this.readTranslate(marksGroup.attr('transform'));
        return [cX - mX, cY - mY];
    }

    /**
     * Parses an SVG `translate(x, y)` transform string.
     * @param transform Transform attribute value.
     * @returns `[x, y]` translation values; falls back to `[0, 0]`.
     */
    private readTranslate(transform: string | null): [number, number] {
        const delta = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        const x = delta ? parseFloat(delta[1]) : 0;
        const y = delta ? parseFloat(delta[2]) : 0;
        return [x, y];
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

        // Check if bounding boxes overlap
        const bboxOverlaps = !(bx1 < rx0 || bx0 > rx1 || by1 < ry0 || by0 > ry1);
        if (!bboxOverlaps) return false;

        // For paths, also check if any sampled point or segment intersects
        const geomNode = node as any;
        if (typeof geomNode.getTotalLength === 'function' && typeof geomNode.getPointAtLength === 'function') {
            const total = geomNode.getTotalLength() as number;

            if (total > 0) {
                const steps = 1000;

                for (let i = 0; i <= steps; i++) {
                    const p = geomNode.getPointAtLength((i / steps) * total) as DOMPoint;
                    // Check if point is inside brush rect
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

