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
        const svgs = d3.selectAll('.autkMark');
        const cls = d3.selectAll('.autkClear');

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
        const brushable = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.selectAll<SVGGElement, unknown>('.autkMarksGroup');

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
        const brushable = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.selectAll<SVGGElement, unknown>('.autkMarksGroup');

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
        const brushable = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        const marksGroup = d3.selectAll<SVGGElement, unknown>('.autkMarksGroup');

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
                            const delta = cBrush.attr("transform").match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);

                            const x0 = (delta ? parseFloat(delta[1]) : 0);
                            const y0 = event.selection[0];
                            const x1 = (cBrush.node()?.getBBox().width || 0) + (delta ? parseFloat(delta[1]) : 0);
                            const y1 = event.selection[1];

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
        const svgs = d3.selectAll('.autkMark');
        svgs.style('fill', (_d: unknown, id: number) => {

            if (this.selection.includes(id)) {
                return PlotStyle.highlight;
            } else {
                return PlotStyle.default;
            }
        });
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
                    if (i == 0 ) {
                        console.log( {p} );
                        console.log( {geomNode} );
                        console.log( {x0, x1, y0, y1} );
                    }
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

