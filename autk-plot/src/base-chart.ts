import { GeoJsonProperties } from "geojson";

import type { ChartConfig, ChartMargins, ChartEvents, ChartEventRecord } from "./api";
import { ColorMapInterpolator } from "./core-types";
import { ChartEvent } from "./events-types";
import { EventEmitter } from "./core-types";

/**
 * Shared base class for all chart implementations.
 *
 * Handles data extraction, sizing defaults, selection state,
 * and transformed-to-source selection index mapping.
 */
export abstract class BaseChart {

    protected _div!: HTMLElement;

    protected _data!: GeoJsonProperties[];

    protected _axis!: string[];
    protected _attributes!: string[];
    protected _title!: string;
    protected _tickFormats!: string[];

    protected _width: number = 800;
    protected _height: number = 500;

    protected _margins!: ChartMargins;

    protected _selection: number[] = [];
    protected _selectionSourceMap: Map<number, number[]> = new Map();

    protected _chartEvents!: ChartEvents;
    protected _enabledEvents: ChartEvent[] = [];

    protected _domain: [number, number] | undefined = undefined;
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQUENTIAL_REDS;


    /**
     * Initializes shared chart state from plot configuration.
     * @param config Plot configuration containing input collection and render options.
     */
    constructor(config: ChartConfig) {
        this._div = config.div;
        this._chartEvents = new EventEmitter<ChartEventRecord>();
        this._enabledEvents = config.events ?? [];

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


    /**
     * Returns internal data rows used by the chart.
     * @returns Normalized feature properties array used for rendering.
     */
    get data(): GeoJsonProperties[] {
        return this._data;
    }

    /**
     * Replaces internal data rows and resets default selection mapping.
     * @param data New rendered rows.
     */
    set data(data: GeoJsonProperties[]) {
        this._data = data;
        this.resetSelectionSourceMap();
    }


    /**
     * Returns selected row indices in the rendered dataset.
     * @returns Current rendered-row indices selected in the chart.
     */
    get selection(): number[] {
        return this._selection;
    }

    /**
     * Updates selected row indices in the rendered dataset.
     * @param selection Rendered-row indices to mark as selected.
     */
    set selection(selection: number[]) {
        this._selection = selection;
    }

    /**
     * Returns the chart event dispatcher.
     * @returns Plot event dispatcher for listener registration.
     */
    get events(): ChartEvents {
        return this._chartEvents;
    }

    /**
     * Returns the list of explicitly enabled event types for this chart.
     * @returns Event types configured at construction time.
     */
    get enabledEvents(): ChartEvent[] {
        return this._enabledEvents;
    }

    /**
     * Applies a new selection and refreshes mark styles.
     * @param selection Source or rendered indices, depending on chart context.
     */
    public setSelection(selection: number[]) {
        this._selection = selection;
        this.updateChartSelection();
    }

    /**
     * Resolves selected rendered indices to source feature indices.
     * @param selection Optional rendered-row selection. Uses current state when omitted.
     * @returns Unique source feature indices represented by the selection.
     */
    public getSelectedSourceIndices(selection: number[] = this._selection): number[] {
        const sourceIndices = selection.flatMap((idx) => this._selectionSourceMap.get(idx) ?? [idx]);
        return Array.from(new Set(sourceIndices));
    }

    /**
     * Sets custom rendered-index to source-index mapping.
     * @param map Mapping from rendered mark index to one or more source feature indices.
     */
    protected setSelectionSourceMap(map: Map<number, number[]>): void {
        this._selectionSourceMap = map;
    }

    /**
     * Restores identity mapping where each rendered row maps to itself.
     */
    protected resetSelectionSourceMap(): void {
        this._selectionSourceMap = new Map(
            this._data.map((_d, idx) => [idx, [idx]])
        );
    }


    /**
     * Transforms `this._data` and updates `_selectionSourceMap` before rendering.
     *
     * The default implementation is the identity: each rendered index maps to
     * itself. Override this method to aggregate or reorder data while preserving
     * the ability to recover original source feature indices from any selection.
     *
     * Rules when overriding:
     *   1. Assign `this.data = transformedRows` first (resets the map to identity).
     *   2. Call `this.setSelectionSourceMap(map)` after to register the real mapping.
     */
    protected computeTransform(): void {
        this.resetSelectionSourceMap();
    }

    /**
     * Template method. Calls `computeTransform()` then `render()`.
     * Do not override — implement `render()` instead.
     */
    public draw(): void {
        this.computeTransform();
        this.render();
    }

    abstract render(): void;

    abstract updateChartSelection(): void;
}