import embed from "vega-embed";
import { TopLevelSpec } from "vega-lite";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";
import { PlotEvent } from "./constants";

export class UtkPlotVega extends UtkPlot {
    protected _vegaSpec: any;
    protected _vegaDataKey!: string;

    constructor(div: HTMLElement, vegaSpec: any, vegaDataKey: string, plotEvents: PlotEvent[]) {
        super(div, plotEvents);

        this.setVegaSpec(vegaSpec, vegaDataKey);
    }

    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;

        if (this._vegaSpec) {
            this._vegaSpec.data = {
                values: this._data,
            };
        }
    }

    get vegaSpec(): TopLevelSpec {
        return this._vegaSpec;
    }

    setVegaSpec(spec: TopLevelSpec, vegaDataKey: string) {
        this._vegaSpec = spec;
        this._vegaDataKey = vegaDataKey;

        if (this._data) {
            this._vegaSpec.data = {
                values: this._data,
            };
        }
    }

    configureSignalListeners(): void {
        const listeners = this.plotEvents.listeners;

        for (const listener in listeners) {
            this._view.addSignalListener(listener, (_selection: any, predicates: any) => {
                const keys = Object.keys(predicates || {});
                if( keys.length === 0 || !keys.includes(this._vegaDataKey)) {
                    this.plotEvents.emit(PlotEvent.BRUSH, [])
                    return;
                }
                else {
                    const locList: number[] = [];

                    predicates[this._vegaDataKey].forEach((value: any) => {
                        const loc = this._data.findIndex( (d: GeoJsonProperties) => {
                            if(!d) return false;
                            return d[this._vegaDataKey] === value;
                        });

                        if (loc !== -1) {
                            locList.push(loc);
                        }
                    });

                    this.plotEvents.emit(listener, locList)
                }
            });
        }
    }

    async draw(): Promise<void> {
        const plot = await embed(this._div, this._vegaSpec, { mode: "vega-lite" });
        this._view = plot.view;

        this.configureSignalListeners();
    }
}
