import * as d3 from "d3";

import { AutkPlot } from "./main";

import { PlotConfig } from "./types";
import { PlotEvent } from "./constants";
import { PlotStyle } from "./plot-style";

export abstract class PlotD3 extends AutkPlot {
    constructor(config: PlotConfig) {
        super(config);
    }

    configureSignalListeners(): void {
        const listeners = this.plotEvents.listeners;

        for (const listener in listeners) {
            if (listener === PlotEvent.CLICK) {
                this.clickEvent();
            }
            if (listener === PlotEvent.BRUSH) {
                this.brushEvent();
            }
            if (listener === PlotEvent.BRUSH_X) {
                this.brushXEvent();
            }
            if (listener === PlotEvent.BRUSH_Y) {
                this.brushYEvent();
            }
        }
    }

    clickEvent(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');

        const plot = this;

        svgs
            .each(function (_d, id: number) {
                d3.select(this)
                    .on('click', function () {
                        if (plot.selection.includes(id)) {
                            plot.selection = plot.selection.filter(loc => loc !== id);
                        } else {
                            plot.selection.push(id);
                        }

                        plot.plotEvents.emit(PlotEvent.CLICK, plot.selection);
                        plot.updatePlotSelection();
                    });
            });

        cls
            .on('click', function () {
                plot.selection = [];

                plot.plotEvents.emit(PlotEvent.CLICK, plot.selection);
                plot.updatePlotSelection();
            });
    }

    brushEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const plot = this;

        brushable
            .each(function () {
                const cBrush = d3.select<SVGGElement, unknown>(this);

                const brush = d3.brush()
                    .extent([[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]])
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

                                    if (plot.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            plot.selection = Array.from(nextSel);
                            plot.plotEvents.emit(PlotEvent.BRUSH, plot.selection);
                            plot.updatePlotSelection();
                        } else {
                            plot.selection = [];
                            plot.plotEvents.emit(PlotEvent.BRUSH, plot.selection);
                            plot.updatePlotSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    brushXEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const plot = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, plot._height - plot._margins.top - plot._margins.bottom]] :
            [[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]];

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
                            const y1 = plot._height + shiftY;

                            const nextSel = new Set<number>();

                            marksGroup.selectAll('.autkMark')
                                .each(function (_d, id: number) {
                                    const node = d3.select(this).node() as SVGGeometryElement | null;
                                    if (!node) return;

                                    if (plot.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            plot.selection = Array.from(nextSel);
                            plot.plotEvents.emit(PlotEvent.BRUSH_X, plot.selection);
                            plot.updatePlotSelection();
                        } else {
                            plot.selection = [];
                            plot.plotEvents.emit(PlotEvent.BRUSH_X, plot.selection);
                            plot.updatePlotSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    brushYEvent(): void {
        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');

        const plot = this;

        const nBrush = brushable.size();
        const extent: [[number, number], [number, number]] = (nBrush > 1) ?
            [[-10, 0], [10, plot._height - plot._margins.top - plot._margins.bottom]] :
            [[0, 0], [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom]];

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

                                    if (plot.nodeIntersectsRect(node, x0, y0, x1, y1)) {
                                        nextSel.add(id);
                                    }
                                });

                            plot.selection = Array.from(nextSel);
                            plot.plotEvents.emit(PlotEvent.BRUSH_Y, plot.selection);
                            plot.updatePlotSelection();
                        } else {
                            plot.selection = [];
                            plot.plotEvents.emit(PlotEvent.BRUSH_Y, plot.selection);
                            plot.updatePlotSelection();
                        }
                    });
                cBrush.call(brush);
            });
    }

    updatePlotSelection(): void {
        const svgs = d3.select(this._div).selectAll('.autkMark');

        svgs.style('fill', (_d: unknown, id: number) => {

            if (this.selection.includes(id)) {
                return PlotStyle.highlight;
            } else {
                return PlotStyle.default;
            }
        });
    }

    protected getNestedValue(obj: any, path: string): any {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part] !== undefined ? acc[part] : undefined, obj);
    }

    // Check if node geometry intersects the brush rectangle.
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

