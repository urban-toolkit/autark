import * as d3 from "d3";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";

import { D3PlotBuilder } from "./types";
import { PlotEvent } from "./constants";
import { PlotStyle } from "./plot-style";

export class UtkPlotD3 extends UtkPlot {
    protected _d3Builder!: D3PlotBuilder;
    protected _svgs!: any;

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

    configureSignalListeners(): void {
        const that = this;

        const cGroup = d3.select(this._ref as SVGSVGElement).select("#plotGroup");
        const svgs = cGroup.selectAll("circle");

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

    async draw(): Promise<void> {
        let svgs: any = [];
        [this._ref, svgs] = this._d3Builder(this._div, this._data);

        this.configureSignalListeners();
    }
}
