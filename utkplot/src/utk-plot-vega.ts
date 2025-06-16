import embed from "vega-embed";
import { TopLevelSpec } from "vega-lite";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";
import { PlotEvent } from "./constants";
import { View } from "vega";

export class UtkPlotVega extends UtkPlot {
    protected _vegaSpec: any;

    constructor(div: HTMLElement, vegaSpec: any, plotEvents: PlotEvent[]) {
        super(div, plotEvents);
        this.vegaSpec = vegaSpec;
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
            if ( Object.keys(this._vegaSpec.params[0].select).includes("fields") ) {
                this._vegaSpec.params[0].select.fields = Object.keys(this._data[0] || {});
            }
        }
    }

    get vegaSpec(): TopLevelSpec {
        return this._vegaSpec;
    }

    set vegaSpec(spec: TopLevelSpec) {
        this._vegaSpec = spec;
    }

    configureSignalListeners(): void {
        const listeners = this.plotEvents.listeners;
        const view = this._ref as View;

        for (const listener in listeners) {
            view.addSignalListener(listener, (_selection: any, predicates: any) => {
                const selectList: GeoJsonProperties[] = [];
                const keys = Object.keys(predicates || {});

                if (keys.length === 0) {
                    this.plotEvents.emit(listener, selectList);
                    return;
                }

                for(let id = 0; id < predicates[keys[0]].length; id++) {
                    const obj: { [key: string]: any } = {};

                    keys.forEach(key => obj[key] = predicates[key][id]);
                    selectList.push(obj);
                }

                this.plotEvents.emit(listener, selectList);
            });
        }
    }

    async draw(): Promise<void> {
        const plot = await embed(this._div, this._vegaSpec, { mode: "vega-lite" });
        this._ref = plot.view;

        this.configureSignalListeners();
    }
}
