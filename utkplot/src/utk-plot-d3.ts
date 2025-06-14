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
        // const listeners = this.plotEvents.listeners;

        // for (const listener in listeners) {
        // }
    }

    async draw(): Promise<void> {
        this._view = this._plotBuilder(this._div, this._d3DataKey, this._data);
        this.configureSignalListeners();
    }
}
