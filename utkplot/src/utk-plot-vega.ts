import embed from "vega-embed";
import { TopLevelSpec } from "vega-lite";

import { GeoJsonProperties } from "geojson";

import { UtkPlot } from "./utk-plot";

export class UtkPlotVega extends UtkPlot {
    protected _vegaSpec: any;

    constructor(div: HTMLElement, vegaSpec: any) {
        super(div);

        this._vegaSpec = vegaSpec;
    }

    get vegaSpec(): TopLevelSpec {
        return this._vegaSpec;
    }

    set vegaSpec(spec: TopLevelSpec) {
        this._vegaSpec = spec;

        if (this._data) {
            this._vegaSpec.data = {
                values: this._data,
            };
        }
    }

    loadData(DataItem: GeoJsonProperties[]): void {
        this._data = DataItem;

        if (this._vegaSpec) {
            this._vegaSpec.data = {
                values: this._data,
            };
        }
    }

    async draw(): Promise<void> {
        const plot = await embed(this._div, this._vegaSpec, {mode: "vega-lite"});

        plot.view.addSignalListener("click", (selection, predicates) => {
            console.log("Selection updated:", selection, predicates);
            console.log("Selection updated:", selection, Array.from(predicates._vgsid_));

            const locList = Array.from(predicates._vgsid_);

            const loc = <number>locList[0];
            this._selection = [this._data[loc]];

            this._mapCallback(<number[]>locList)
        });
    }
}
