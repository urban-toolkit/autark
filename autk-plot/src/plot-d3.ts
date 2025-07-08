import * as d3 from "d3";

import { GeoJsonProperties } from "geojson";

import { AutkPlot } from "./autk-plot";

import { D3PlotBuilder } from "./types";
import { PlotEvent } from "./constants";
import { PlotStyle } from "./plot-style";

export class PlotD3 extends AutkPlot {
    protected _d3Builder!: D3PlotBuilder;

    protected _svgs!: unknown[];
    protected _locList: GeoJsonProperties[] = [];
    protected _brush!: d3.BrushBehavior<unknown>;

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

        if(this.plotEvents.listeners[PlotEvent.BRUSH] && this._locList.length === 0) {
            const svg = d3.select(this._ref as SVGSVGElement);
            const brushGroup = svg.select<SVGGElement>("g.brush");
            brushGroup.call(this._brush.move, null);
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

        d3.select(this._ref as SVGSVGElement)
            .on('click', function (event: MouseEvent) {
                if (event.target === that._ref) {
                    that._locList = [];

                    svgs.style("fill", PlotStyle.default);
                    that.plotEvents.emit(PlotEvent.CLICK, that._locList)
                }
            });
    }

    brushEvent(): void {
        const that = this;
        const svgs = d3.selectAll(this._svgs as any[]);

        //---- Brush event -------
        this._brush = d3.brush()
            .on("start end", function (event: any) {
                if (event.selection) {
                    const selection = event.selection;

                    svgs.style("fill", function (datumId: unknown) {
                        const dataId = datumId as GeoJsonProperties;
                        const loc = that._locList.indexOf(dataId as GeoJsonProperties);

                        const bbox = d3.select(this).node()?.getBBox();
                        const center = [ bbox?.x + bbox?.width / 2, bbox?.y + bbox?.height / 2 ];

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

        const svg = d3.select(this._ref as SVGSVGElement);
        let brushGroup = svg.select<SVGGElement>("g.brush");

        if (brushGroup.empty()) {
            const parent = svgs.select(function() { return this.parentNode; });
            const transform = parent.attr("transform") || "translate(0, 0)";
            
            brushGroup = svg.append("g")
                .attr("class", "brush")
                .attr("transform", transform);
        }
        
        brushGroup.call(this._brush);
    }

    async draw(): Promise<void> {
        [this._ref, this._svgs] = this._d3Builder(this._div, this._data);
        this.configureSignalListeners();
    }
}
