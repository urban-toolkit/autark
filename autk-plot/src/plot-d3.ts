import * as d3 from "d3";

import { GeoJsonProperties } from "geojson";

import { AutkPlot } from "./main";

import { D3PlotBuilder } from "./types";
import { PlotEvent } from "./constants";
import { PlotStyle } from "./plot-style";

export class PlotD3 extends AutkPlot {
    protected _d3Builder!: D3PlotBuilder;

    protected _svgs!: unknown[];
    protected _locList: GeoJsonProperties[] = [];
    protected _brushes: { 
        group: SVGGElement, brush: d3.BrushBehavior<unknown> 
    }[] = [];

    constructor(div: HTMLElement, d3Builder: D3PlotBuilder, plotEvents: PlotEvent[]) {
        super(div, plotEvents);
        this._d3Builder = d3Builder;
    }

    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
    }

    set locList(locList: GeoJsonProperties[]) {
        this._locList = locList;

        if (this.plotEvents.listeners[PlotEvent.BRUSH] && this._locList.length === 0) {
            this._brushes.forEach(obj => {
                const brushGroup = d3.select(obj.group);
                brushGroup.call(obj.brush.move, null);
            });
        }
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
            if (listener === PlotEvent.BRUSH_Y) {
                this.brushYEvent();
            }
            if (listener === PlotEvent.BRUSH_X) {
                this.brushXEvent();
            }

        }
    }

    clickEvent(): void {
        const that = this;
        const svgs = d3.selectAll(this._svgs as any[]);

        //---- Click event -------
        svgs
            .on('click', function (_event: MouseEvent, datumId: unknown) {
                const dataId = datumId as GeoJsonProperties;

                svgs
                    .style("fill", function (datumJd: unknown) {
                        const dataJd = datumJd as GeoJsonProperties;

                        if (dataId === dataJd) {
                            const loc = that._locList.indexOf(dataJd as GeoJsonProperties);
                            if (loc === -1) {
                                that._locList.push(dataJd as GeoJsonProperties);
                                return PlotStyle.highlight;
                            } else {
                                that._locList.splice(loc, 1);
                                return PlotStyle.default;
                            }
                        }
                        else {
                            return d3.select(this).style("fill");
                        }
                    });

                that.plotEvents.emit(PlotEvent.CLICK, that._locList);
            });

        const groups = (this.refs as SVGGElement[]);
        groups.forEach((group: SVGGElement) => {
            d3.select(group)
                .on('click', function (event: MouseEvent) {
                    if (event.target === group) {
                        that._locList = [];

                        svgs.style("fill", PlotStyle.default);
                        that.plotEvents.emit(PlotEvent.CLICK, that._locList)
                    }
                });
        });
    }

    brushEvent(): void {
        const that = this;
        const svgs = d3.selectAll(this._svgs as any[]);

        //---- Brush events -------
        const groups = (this.refs as SVGGElement[]);

        groups.forEach((group: SVGGElement) => {
            const brush = d3.brush()
            .on("start brush end", function (event: any) {
                if (event.selection) {
                    const selection = event.selection;

                    svgs.style("fill", function (datumId: unknown) {
                        const dataId = datumId as GeoJsonProperties;
                        const loc = that._locList.indexOf(dataId as GeoJsonProperties);

                        const bbox = d3.select(this).node()?.getBBox();
                        const center = [bbox?.x + bbox?.width / 2, bbox?.y + bbox?.height / 2];

                        if (center[0] >= selection[0][0] && center[0] <= selection[1][0] &&
                            center[1] >= selection[0][1] && center[1] <= selection[1][1]) {
                            if (loc === -1) {
                                that._locList.push(dataId as GeoJsonProperties);
                            }
                            return PlotStyle.highlight;
                        } else {
                            if (loc >= 0) {
                                that._locList.splice(loc, 1);
                            }
                            return PlotStyle.default;
                        }
                    });
                }

                that.plotEvents.emit(PlotEvent.BRUSH, that._locList);
            });

            // stores the brush and the group
            this._brushes.push({ group, brush });

            const svg = d3.select(group);
            let brushGroup = svg.select<SVGGElement>("g.brush");

            if (brushGroup.empty()) {
                brushGroup = svg.append("g")
                    .attr("class", "brush");
            }

            brushGroup.call(brush);

        });
    }

    brushYEvent(): void {
        const that = this;
        const marks = d3.selectAll(this._svgs as any[]);

        const status = this._svgs.map(() => (this._refs as SVGGElement[]).map(() => -1));

        //---- Brush events -------
        const groups = (this.refs as SVGGElement[]);

        groups.forEach((group: SVGGElement, gId: number) => {
            const groupNode = d3.select(group);
            const height = groupNode.node()?.getBBox()?.height || 0;

            const brush = d3.brushY()
            .extent([
                [-10, 0],
                [ 10, height]
            ])
            .on("start brush end", function (event: any) {
                if (event.selection) {
                    const selection = event.selection;

                    marks.each(function (_d, mId: number) {
                        const coords = d3.select(this).attr('d').split(/[,;ML]/).filter(str => str !== '').map(str => Number(str));

                        if (selection[0] === selection[1]) {
                            status[mId][gId] = -1;
                        }
                        else {
                            status[mId][gId] = (coords[2 * gId + 1] >= selection[0] && coords[2 * gId + 1] <= selection[1]) ? 1 : 0;
                        }

                    });

                    marks.style("stroke", function (datumId: unknown, mId: number) {
                        const dataId = datumId as GeoJsonProperties;
                        const loc = that._locList.indexOf(dataId as GeoJsonProperties);

                        if (status[mId].filter(s => s === -1).length !== groups.length && 
                            status[mId].filter(s => Math.abs(s) !== 1).length === 0) {
                            if (loc === -1) {
                                that._locList.push(dataId as GeoJsonProperties);
                            }
                            return PlotStyle.highlight;
                        } else {
                            if (loc >= 0) {
                                that._locList.splice(loc, 1);
                            }
                            return PlotStyle.default;
                        }
                    });
                }

                that.plotEvents.emit(PlotEvent.BRUSH_Y, that._locList);
            });

            // stores the brush and the group
            this._brushes.push({ group, brush });

            const svg = d3.select(group);
            let brushGroup = svg.select<SVGGElement>("g.brush");

            if (brushGroup.empty()) {
                brushGroup = svg.append("g")
                    .attr("class", "brush");
            }

            brushGroup.call(brush);

        });
    }

    brushXEvent(): void {

        const groups: SVGGElement[] = this.refs as SVGGElement[];

        groups.forEach((group: SVGGElement, gId: number) => {

            const groupNode = d3.select(group);
            const width = groupNode.node()?.getBBox()?.width || 0;
            const height = groupNode.node()?.getBBox()?.height || 0;

            const brush = d3.brushX()
                .extent([
                    [0, 0],
                    [width, height]
                ])
                .on("start brush end", (event: any) => {

                    const selection = event.selection;
                    this.plotEvents.emit(PlotEvent.BRUSH_X, selection);
                }
            )

            const svg = d3.select(group);
            let brushGroup = svg.select<SVGGElement>("g.brush");

            if (brushGroup.empty()) {
                brushGroup = svg.append("g")
                    .attr("class", "brush");
            }

            brushGroup.call(brush);

        })

    }

    async draw(): Promise<void> {
        [this._refs, this._svgs] = this._d3Builder(this._div, this._data);
        this.configureSignalListeners();
    }
}
