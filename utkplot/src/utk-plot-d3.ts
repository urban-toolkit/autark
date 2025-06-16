import * as d3 from "d3";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";
import { D3PlotBuilder, PlotEvent } from "./constants";

export class UtkPlotD3 extends UtkPlot {
    protected _d3Spec!: D3PlotBuilder;

    constructor(div: HTMLElement, plotBuilder: D3PlotBuilder, plotEvents: PlotEvent[]) {
        super(div, plotEvents);
        this._d3Spec = plotBuilder;
    }

    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
    }

    configureSignalListeners(): void {
        let locList: number[] = [];
        const cGroup = d3.select(<SVGSVGElement>this._ref).select("#plotGroup");

        //---- Click event -------

        (cGroup.selectAll<SVGCircleElement, GeoJsonProperties>("circle") as d3.Selection<SVGCircleElement, GeoJsonProperties, any, any>)
            .on('click', (event: MouseEvent, d: GeoJsonProperties) => {
                if (event.target instanceof SVGCircleElement) {
                    (cGroup.selectAll<SVGCircleElement, GeoJsonProperties>("circle") as d3.Selection<SVGCircleElement, GeoJsonProperties, any, any>)
                        .style("fill", (data: GeoJsonProperties, id: number, nodes: ArrayLike<SVGCircleElement>) => {
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
                                return d3.select(nodes[id]).style("fill");
                            }
                        });
                }

                this.plotEvents.emit(PlotEvent.CLICK, locList)
            });

        d3.select(this._ref as SVGSVGElement).on('click', (event: MouseEvent) => {
            if (event.target === this._ref) {
                locList = []; // Clear selection
                cGroup.selectAll("circle")
                    .style("fill", 'lightgray'); // Reset color
            }

            this.plotEvents.emit(PlotEvent.CLICK, locList)
        });
    }

    async draw(): Promise<void> {
        this._ref = this._d3Spec(this._div, this._data);

        this.configureSignalListeners();
    }
}
