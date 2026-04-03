import { GeoJsonProperties } from "geojson";

import type { AutkDatum, ChartConfig, ChartMargins, ChartEvents, ChartEventRecord } from "./api";
import { ColorMapInterpolator } from "./core-types";
import { ChartEvent } from "./events-types";
import { EventEmitter } from "./core-types";

/**
 * Shared base class for all chart implementations.
 *
 * Handles data extraction, sizing defaults, selection state,
 * and source-id based selection mapping via `autkIds`.
 */
export abstract class BaseChart {

    protected _div!: HTMLElement;

    protected _data!: AutkDatum[];

    protected _axis!: string[];
    protected _attributes!: string[];
    protected _title!: string;
    protected _tickFormats!: string[];

    protected _width: number = 800;
    protected _height: number = 500;

    protected _margins!: ChartMargins;

    protected _selection: number[] = [];

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

        this._data = this.ensureAutkIds(config.collection.features.map((f) => f.properties as AutkDatum));
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
    get data(): AutkDatum[] {
        return this._data;
    }

    /**
     * Replaces internal data rows.
     * @param data New rendered rows.
     */
    set data(data: GeoJsonProperties[]) {
        this._data = this.ensureAutkIds(data as AutkDatum[]);
    }


    /**
     * Returns selected source feature indices.
     * @returns Current source feature indices selected in the chart.
     */
    get selection(): number[] {
        return this._selection;
    }

    /**
     * Updates selected source feature indices.
     * @param selection Source feature indices to mark as selected.
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
     * @param selection Source feature indices.
     */
    public setSelection(selection: number[]) {
        this._selection = selection;
        this.updateChartSelection();
    }

    /**
     * Resolves selected source ids to a unique normalized array.
     * @param selection Optional source-id selection. Uses current state when omitted.
     * @returns Unique source feature indices represented by the selection.
     */
    public getSelectedSourceIndices(selection: number[] = this._selection): number[] {
        return Array.from(new Set(selection.filter((idx) => Number.isFinite(idx))));
    }

    /**
     * Resolves source ids from a mark datum using the `autkIds` contract.
     *
     * Falls back to the provided rendered index when `autkIds` is absent.
     * @param datum Bound mark datum.
     * @param fallbackId Rendered index fallback for identity mappings.
     */
    protected getDatumAutkIds(datum: unknown, fallbackId?: number): number[] {
        if (datum && typeof datum === 'object') {
            const candidate = (datum as { autkIds?: unknown }).autkIds;
            if (Array.isArray(candidate)) {
                const ids = candidate.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
                if (ids.length > 0) return ids;
            }
        }

        if (typeof fallbackId === 'number' && Number.isFinite(fallbackId)) {
            return [fallbackId];
        }

        return [];
    }

    /**
     * Ensures every row carries the source-id contract field.
     * @param data Render rows.
     */
    protected ensureAutkIds(data: AutkDatum[]): AutkDatum[] {
        return data.map((row, idx) => {
            const ids = Array.isArray(row?.autkIds) ? row.autkIds : [idx];
            return { ...(row ?? {}), autkIds: ids };
        });
    }

    /**
     * Transforms `this._data` before rendering.
     *
     * The default implementation is a no-op. Override this method to aggregate
     * or reorder data while preserving `autkIds` on each rendered datum.
     */
    protected computeTransform(): void {}

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
