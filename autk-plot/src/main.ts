import { GeoJsonProperties } from "geojson";

import { PlotConfig, PlotMargins } from "./types";
import { ColorMapInterpolator } from "./constants";
import { PlotEvents } from "./plot-events";

export abstract class BaseChart {

    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];

    protected _axis!: string[];
    protected _attributes!: string[];
    protected _title!: string;
    protected _tickFormats!: string[];

    protected _width: number = 800;
    protected _height: number = 500;

    protected _margins!: PlotMargins;

    protected _selection: number[] = [];
    protected _selectionSourceMap: Map<number, number[]> = new Map();

    protected _plotEvents!: PlotEvents;

    protected _domain: [number, number] | undefined = undefined;
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQUENTIAL_REDS;


    constructor(config: PlotConfig) {
        this._div = config.div;
        this._plotEvents = new PlotEvents(config.events ?? []);

        this._data = config.collection.features.map((f) => f.properties);
        this.resetSelectionSourceMap();
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };
        this._width = config.width || 800;
        this._height = config.height || 500;

        const axisLabels = config.labels?.axis ?? [];
        const attributes = config.attributes ?? axisLabels;
        this._axis = axisLabels.length > 0 ? axisLabels : attributes;
        this._attributes = attributes;
        this._title = config.labels?.title || 'Autk Plot';
        this._tickFormats = config.tickFormats ?? ['.2s', '.2s'];
        this._domain = config.domain;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQUENTIAL_REDS;
    }


    get data(): GeoJsonProperties[] {
        return this._data;
    }

    set data(data: GeoJsonProperties[]) {
        this._data = data;
        this.resetSelectionSourceMap();
    }


    get selection(): number[] {
        return this._selection;
    }

    set selection(selection: number[]) {
        this._selection = selection;
    }

    get events(): PlotEvents {
        return this._plotEvents;
    }

    public setSelection(selection: number[]) {
        this._selection = selection;
        this.updatePlotSelection();
    }

    public getSelectedSourceIndices(selection: number[] = this._selection): number[] {
        const sourceIndices = selection.flatMap((idx) => this._selectionSourceMap.get(idx) ?? [idx]);
        return Array.from(new Set(sourceIndices));
    }

    protected setSelectionSourceMap(map: Map<number, number[]>): void {
        this._selectionSourceMap = map;
    }

    protected resetSelectionSourceMap(): void {
        this._selectionSourceMap = new Map(
            this._data.map((_d, idx) => [idx, [idx]])
        );
    }


    abstract draw(): void;

    abstract updatePlotSelection(): void;
}