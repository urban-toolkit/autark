import * as d3 from "d3";

import { AutkPlot } from "./main";

import { D3PlotBuilder } from "./types";
import { PlotEvent } from "./constants";

export class PlotD3 extends AutkPlot {
    protected _d3Builder!: D3PlotBuilder;

    constructor(div: HTMLElement, d3Builder: D3PlotBuilder, plotEvents: PlotEvent[]) {
        super(div, plotEvents);
        this._d3Builder = d3Builder;
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
        const that = this;
        const svgs = d3.selectAll('.autkMark');
        const grps = d3.selectAll('.autkClickable');

        let locList: number[] = [];

        svgs
            .each( function(_d, id: number) {
                d3.select(this)
                    .on('click', function (_event: MouseEvent) {
                        console.log(_event)
                        if (locList.includes(id)) {
                            locList = locList.filter(loc => loc !== id);
                        } else {
                            locList.push(id);
                        }

                        that.plotEvents.emit(PlotEvent.CLICK, locList);
                    });
            });

        grps
            .on('click', function (event: MouseEvent) {
                if (event.target === this) {
                    locList = [];
                    that.plotEvents.emit(PlotEvent.CLICK, locList);
                }
            });
    }

    brushEvent(): void {
        const that = this;
        const selections: number[][] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d, id: number) {
            selections.push([]);

            const brush = d3.brush()
            .on("start brush end", function (event: any) {
                if (event.selection) {
                    selections[id] = event.selection;
                    that.plotEvents.emit(PlotEvent.BRUSH, selections);
                }
            });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
        });
    }

    brushXEvent(): void {
        const that = this;
        const selections: number[][] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d, id: number) {
            selections.push([]);

            const brush = d3.brushX()
            .on("start brush end", function (event: any) {
                if (event.selection) {
                    selections[id] = event.selection;
                    that.plotEvents.emit(PlotEvent.BRUSH_X, selections);
                }
            });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
        });
    }    

    brushYEvent(): void {
        const that = this;
        const selections: number[][] = [];

        //---- Brush events -------
        const groups = d3.selectAll<SVGGElement, unknown>('.autkBrushable');
        groups.each(function (_d, id: number) {
            selections.push([]);

            const brush = d3.brushY()
            .on("start brush end", function (event: any) {
                if (event.selection) {
                    selections[id] = event.selection;
                    that.plotEvents.emit(PlotEvent.BRUSH_Y, selections);
                }
            });

            const groupNode = d3.select<SVGGElement, unknown>(this);
            groupNode.call(brush);
        });
    }    

    // brushYEvent(): void {
    //     const that = this;
    //     const marks = d3.selectAll(this._svgs as any[]);

    //     const status = this._svgs.map(() => (this._refs as SVGGElement[]).map(() => -1));

    //     //---- Brush events -------
    //     const groups = (this.refs as SVGGElement[]);

    //     groups.forEach((group: SVGGElement, gId: number) => {
    //         const groupNode = d3.select(group);
    //         const height = groupNode.node()?.getBBox()?.height || 0;

    //         const brush = d3.brushY()
    //         .extent([
    //             [-10, 0],
    //             [ 10, height]
    //         ])
    //         .on("start brush end", function (event: any) {
    //             if (event.selection) {
    //                 const selection = event.selection;

    //                 console.log(selection);

    //                 marks.each(function (_d, mId: number) {
    //                     const coords = d3.select(this).attr('d').split(/[,;ML]/).filter(str => str !== '').map(str => Number(str));

    //                     if (selection[0] === selection[1]) {
    //                         status[mId][gId] = -1;
    //                     }
    //                     else {
    //                         status[mId][gId] = (coords[2 * gId + 1] >= selection[0] && coords[2 * gId + 1] <= selection[1]) ? 1 : 0;
    //                     }

    //                 });

    //                 marks.style("stroke", function (datumId: unknown, mId: number) {
    //                     const dataId = datumId as GeoJsonProperties;
    //                     const loc = that._locList.indexOf(dataId as GeoJsonProperties);

    //                     if (status[mId].filter(s => s === -1).length !== groups.length && 
    //                         status[mId].filter(s => Math.abs(s) !== 1).length === 0) {
    //                         if (loc === -1) {
    //                             that._locList.push(dataId as GeoJsonProperties);
    //                         }
    //                         return PlotStyle.highlight;
    //                     } else {
    //                         if (loc >= 0) {
    //                             that._locList.splice(loc, 1);
    //                         }
    //                         return PlotStyle.default;
    //                     }
    //                 });
    //             }

    //             that.plotEvents.emit(PlotEvent.BRUSH_Y, that._locList);
    //         });

    //         // stores the brush and the group
    //         this._brushes.push({ group, brush });

    //         const svg = d3.select(group);
    //         let brushGroup = svg.select<SVGGElement>("g.brush");

    //         if (brushGroup.empty()) {
    //             brushGroup = svg.append("g")
    //                 .attr("class", "brush");
    //         }

    //         brushGroup.call(brush);

    //     });
    // }

    async draw(): Promise<void> {
        this._d3Builder(this._div, this._data);
        this.configureSignalListeners();
    }
}
