import { GeoJsonProperties } from "geojson";
import { PlotEvent } from "./constants";
import { PlotEvents } from "./plot-events";

export abstract class UtkPlot {
    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];
    protected _selection!: GeoJsonProperties[];

    protected _plotEvents!: PlotEvents;

    constructor(svg: HTMLElement, events: PlotEvent[] = [PlotEvent.CLICK]) {
        this._div = svg;
        this._plotEvents = new PlotEvents(events);
    }

    get selection(): GeoJsonProperties[] {
        return this._selection;
    }

    set selection(selection: GeoJsonProperties[]) {
        this._selection = selection;
        this.draw();
    }

    get plotEvents(): PlotEvents {
        return this._plotEvents;
    }

    loadData(DataItem: GeoJsonProperties[]) {
        this._data = DataItem;
    }
    
    abstract draw(): Promise<void>;
}