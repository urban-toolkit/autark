import * as d3 from "d3";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";
import { D3PlotBuilder, PlotEvent } from "./constants";

export class UtkPlotD3 extends UtkPlot {
    protected _d3DataKey!: string;

    protected _plotBuilder!: D3PlotBuilder;

    constructor(div: HTMLElement, plotBuilder: D3PlotBuilder, d3DataKey: string, plotEvents: PlotEvent[]) {
        super(div, plotEvents);

        this._d3DataKey = d3DataKey;
        this._plotBuilder = plotBuilder;
    }

    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
    }

    configureSignalListeners(): void {
        let locList: number[] = [];
        const cGroup = this._view.select("#plotGroup");

        cGroup.selectAll("circle")
            .on('click', (event: MouseEvent, d: GeoJsonProperties) => {
                if (event.target instanceof SVGCircleElement) {
                    cGroup.selectAll("circle")
                        .style("fill", function (this: SVGCircleElement, data: GeoJsonProperties, id: number) {
                            if (data?.ntaname === d?.ntaname) {
                                const loc = locList.indexOf(id);

                                if (loc === -1) {
                                    locList.push(id);
                                    return '#5dade2'; // Highlight color
                                } else {
                                    locList.splice(loc, 1);
                                    return 'lightgray'; // Default color
                                }
                            }
                            else {
                                return d3.select(this).style("fill");
                            }
                        });
                }

                this.plotEvents.emit(PlotEvent.CLICK, locList)
            });

        this._view.on('click', (event: MouseEvent) => {
            if (event.target === this._view.node()) {
                locList = []; // Clear selection
                cGroup.selectAll("circle")
                    .style("fill", 'lightgray'); // Reset color
            }

            this.plotEvents.emit(PlotEvent.CLICK, locList)
        });
    }

    async draw(): Promise<void> {
        this._view = this._plotBuilder(this._div, this._d3DataKey, this._data);

        this.configureSignalListeners();
    }
}
