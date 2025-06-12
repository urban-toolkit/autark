import { GeoJsonProperties } from "geojson";
import { PlotEvent } from "./constants";
import { PlotEvents } from "./plot-events";

export abstract class UtkPlot {
    protected _div!: HTMLElement;
    protected _view!: any; 

    protected _data!: GeoJsonProperties[];
    protected _selectedIds!: number[] | string[];

    protected _plotEvents!: PlotEvents;

    constructor(svg: HTMLElement, events: PlotEvent[] = [PlotEvent.CLICK]) {
        this._div = svg;
        this._plotEvents = new PlotEvents(events);
    }

    get view(): any {
        return this._view;
    }

    get selectedIds(): number[] | string[] {
        return this._selectedIds;
    }

    set selectedIds(selectedIds: number[] | string[]) {
        this._selectedIds = selectedIds;
    }

    get plotEvents(): PlotEvents {
        return this._plotEvents;
    }

    loadData(DataItem: GeoJsonProperties[]) {
        this._data = DataItem;
    }
    
    abstract draw(): Promise<void>;
}