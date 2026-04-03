import * as d3 from "d3";

import { BaseChart } from "./base-chart";

import type { ChartConfig } from "./api";
import { ChartEvent } from "./events-types";
import { ChartStyle } from "./chart-style";
import { valueAtPath } from "autk-core";

/**
 * Base class for D3-driven chart implementations.
 *
 * Provides shared interaction handlers and selection styling behavior.
 */
export abstract class ChartD3 extends BaseChart {
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
     * The enabled events are defined by the chart's configuration.
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
     */
    clickEvent(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');

        const chart = this;

        svgs
            .each(function (_d, id: number) {
                d3.select(this)
                    .on('click', function () {
                        if (chart.selection.includes(id)) {
                            chart.selection = chart.selection.filter(loc => loc !== id);
                        } else {
                            chart.selection.push(id);
                        }

                        chart.events.emit(ChartEvent.CLICK, { selection: chart.getSelectedSourceIndices() });
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
     */
    brushEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const chart = this;

        brushable
            .each(function () {
                const cBrush = d3.select<SVGGElement, unknown>(this);

                const brush = d3.brush()
                    .extent([[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]])
                    .on("start end", function (event: any) {
                        if (event.selection) {
                            const x0 = event.selection[0][0];
                            const y0 = event.selection[0][1];
                            const x1 = event.selection[1][0];
                            const y1 = event.selection[1][1];

                            const nextSel = new Set<number>();

                            marksGroup.selectAll('.autkMark')
                                .each(function (_d, id: number) {
                                    const node = d3.select(this).node() as SVGGeometryElement | null;
                                    if (!node) return;

                                    if (chart.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            chart.selection = Array.from(nextSel);
                            chart.events.emit(ChartEvent.BRUSH, { selection: chart.getSelectedSourceIndices() });
                            chart.updateChartSelection();
                        } else {
                            chart.selection = [];
                            chart.events.emit(ChartEvent.BRUSH, { selection: [] });
                            chart.updateChartSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Enables horizontal brushing interactions.
     */
    brushXEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const chart = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, chart._height - chart._margins.top - chart._margins.bottom]] :
            [[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]];

        brushable
            .each(function () {
                const cBrush = d3.select<SVGGElement, unknown>(this);

                const brush = d3.brushX()
                    .extent(extent)
                    .on("start end", function (event: any) {
                        if (event.selection) {
                            const cDelta = cBrush.attr("transform")?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                            const cX = cDelta ? parseFloat(cDelta[1]) : 0;
                            const cY = cDelta ? parseFloat(cDelta[2]) : 0;

                            const mDelta = marksGroup.attr("transform")?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                            const mX = mDelta ? parseFloat(mDelta[1]) : 0;
                            const mY = mDelta ? parseFloat(mDelta[2]) : 0;

                            const shiftX = cX - mX;
                            const shiftY = cY - mY;

                            const x0 = event.selection[0] + shiftX;
                            const y0 = -10 + shiftY; // Assuming height padding is approx -10 to +height+10
                            const x1 = event.selection[1] + shiftX;
                            const y1 = chart._height + shiftY;

                            const nextSel = new Set<number>();

                            marksGroup.selectAll('.autkMark')
                                .each(function (_d, id: number) {
                                    const node = d3.select(this).node() as SVGGeometryElement | null;
                                    if (!node) return;

                                    if (chart.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            chart.selection = Array.from(nextSel);
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: chart.getSelectedSourceIndices() });
                            chart.updateChartSelection();
                        } else {
                            chart.selection = [];
                            chart.events.emit(ChartEvent.BRUSH_X, { selection: [] });
                            chart.updateChartSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Enables vertical brushing interactions.
     */
    brushYEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const chart = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, chart._height - chart._margins.top - chart._margins.bottom]] :
            [[0, 0], [chart._width - chart._margins.left - chart._margins.right, chart._height - chart._margins.top - chart._margins.bottom]];

        brushable
            .each(function () {
                const cBrush = d3.select<SVGGElement, unknown>(this);

                const brush = d3.brushY()
                    .extent(extent)
                    .on("start end", function (event: any) {
                        if (event.selection) {
                            const cDelta = cBrush.attr("transform")?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                            const cX = cDelta ? parseFloat(cDelta[1]) : 0;
                            const cY = cDelta ? parseFloat(cDelta[2]) : 0;

                            const mDelta = marksGroup.attr("transform")?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                            const mX = mDelta ? parseFloat(mDelta[1]) : 0;
                            const mY = mDelta ? parseFloat(mDelta[2]) : 0;

                            const shiftX = cX - mX;
                            const shiftY = cY - mY;

                            // For brushY, the x extent is typically [-10, 10]
                            const extWidth = 10;
                            const x0 = shiftX - extWidth;
                            const y0 = event.selection[0] + shiftY;
                            const x1 = shiftX + extWidth;
                            const y1 = event.selection[1] + shiftY;

                            const nextSel = new Set<number>();

                            marksGroup.selectAll('.autkMark')
                                .each(function (_d, id: number) {
                                    const node = d3.select(this).node() as SVGGeometryElement | null;
                                    if (!node) return;

                                    if (chart.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            chart.selection = Array.from(nextSel);
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.getSelectedSourceIndices() });
                            chart.updateChartSelection();
                        } else {
                            chart.selection = [];
                            chart.events.emit(ChartEvent.BRUSH_Y, { selection: [] });
                            chart.updateChartSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    /**
     * Applies selection styles on marks using the default/highlight palette.
     *
     * Subclasses can override this when selected styling is not fill-based.
     */
    updateChartSelection(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');

        svgs.style('fill', (_d: unknown, id: number) => {

            if (this.selection.includes(id)) {
                return ChartStyle.highlight;
            } else {
                return ChartStyle.default;
            }
        });
    }

    /**
     * Reads a nested value from an object using dot-notation paths.
     * @param obj Source object.
     * @param path Dot-notation path, for example `compute.angle`.
     * @returns The resolved value or `undefined` when any path segment is missing.
     */
    protected getNestedValue(obj: any, path: string): any {
        if (!obj || !path) return undefined;
        return valueAtPath(obj, path);
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

