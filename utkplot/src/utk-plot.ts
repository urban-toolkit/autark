import { GeoJsonProperties } from "geojson";

export abstract class UtkPlot {
    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];
    protected _selection!: GeoJsonProperties[];

    protected _mapCallback!: (selection: number[]) => void;

    constructor(svg: HTMLElement) {
        this._div = svg;
    }

    get selection(): GeoJsonProperties[] {
        return this._selection;
    }

    set selection(selection: GeoJsonProperties[]) {
        this._selection = selection;
        this.draw();
    }

    set mapCallback(callback: (selection: number[]) => void) {
        this._mapCallback = callback;
    }

    loadData(DataItem: GeoJsonProperties[]) {
        this._data = DataItem;
    }
    
    abstract draw(): Promise<void>;
}