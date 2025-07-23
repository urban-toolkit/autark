import { GeoJsonProperties } from "geojson";
import { PlotEvent } from "./constants";
import { PlotEvents } from "./plot-events";

export abstract class AutkPlot {
    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];

    protected _plotEvents!: PlotEvents;

    constructor(svg: HTMLElement, events: PlotEvent[]) {
        this._div = svg;
        this._plotEvents = new PlotEvents(events);
    }

    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
    }

    get plotEvents(): PlotEvents {
        return this._plotEvents;
    }

    abstract configureSignalListeners(): void;

    abstract draw(): Promise<void>;
}