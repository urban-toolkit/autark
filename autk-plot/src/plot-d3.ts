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
        const that = this;
        const selections: number[] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d) {

            const brush = d3.brush()
                .on("start brush end", function (event: any) {
                    if (event.selection) {
                        selections.push(...event.selection);
                        that.plotEvents.emit(PlotEvent.BRUSH, selections);
                    }
                });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
        });
    }

    brushXEvent(): void {
        const that = this;
        const selections: number[] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d) {

            const brush = d3.brushX()
                .on("start brush end", function (event: any) {
                    if (event.selection) {
                        selections.push(...event.selection);
                        that.plotEvents.emit(PlotEvent.BRUSH_X, selections);
                    }
                });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
        });
    }

    brushYEvent(): void {
        const that = this;
        const selections: number[] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d) {

            const brush = d3.brushY()
                .on("start brush end", function (event: any) {
                    if (event.selection) {
                        selections.push(...event.selection);
                        that.plotEvents.emit(PlotEvent.BRUSH_Y, selections);
                    }
                });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
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
}

