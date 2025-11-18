import { GeoJsonProperties } from "geojson";

import { PlotConfig, PlotMargins } from "./types";
import { PlotEvents } from "./plot-events";

export abstract class AutkPlot {

    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];

    protected _axis!: string[];
    protected _title!: string;

    protected _width: number = 800;
    protected _height: number = 500;

    protected _margins!: PlotMargins;

    protected _selection: number[] = [];

    protected _plotEvents!: PlotEvents;


    constructor(config: PlotConfig) {
        this._div = config.div;
        this._plotEvents = new PlotEvents(config.events);

        this._data = config.data.features.map((f) => f.properties);
        this._margins = config.margins || { left: 60, right: 20, top: 50, bottom: 50 };
        this._width = config.width || 800;
        this._height = config.height || 500;

        this._axis = config.labels?.axis || [];
        this._title = config.labels?.title || 'Autk Plot';
    }


    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
    }


    get selection(): number[] {
        return this._selection;
    }

    set selection(selection: number[]) {
        this._selection = selection;
    }

    get plotEvents(): PlotEvents {
        return this._plotEvents;
    }

    public setHighlightedIds(selection: number[]) {
        this._selection = selection;

        this.updatePlotSelection();
    }


    abstract draw(): void;

    abstract updatePlotSelection(): void;
}