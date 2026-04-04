import { GeoJsonProperties } from "geojson";

import type { AutkDatum, ChartConfig, ChartMargins, ChartEvents, ChartEventRecord } from "./api";
import { ColorMapInterpolator } from "./core-types";
import { ChartEvent } from "./events-types";
import { EventEmitter } from "./core-types";

/**
 * Shared base class for all chart implementations.
 *
 * `BaseChart` normalizes input data, stores common rendering options, tracks
 * selection state, and exposes the minimal lifecycle used by concrete charts.
 *
 * Identity mapping for interactions is based on `autkIds`, which always refer
 * to source feature ids from the input collection.
 */
export abstract class BaseChart {

    /** Host element where the chart is rendered. */
    protected _div!: HTMLElement;

    /** Normalized render rows bound to marks. */
    protected _data!: AutkDatum[];

    /** User-facing axis labels. */
    protected _axis!: string[];
    /** Dot-path attributes used to read values from row objects. */
    protected _attributes!: string[];
    /** Plot title text. */
    protected _title!: string;
    /** D3 tick-format specifiers used by axis renderers. */
    protected _tickFormats!: string[];

    /** Outer chart width in pixels. */
    protected _width: number = 800;
    /** Outer chart height in pixels. */
    protected _height: number = 500;

    /** Plot margins in pixels. */
    protected _margins!: ChartMargins;

    /** Current selected source ids. */
    protected _selection: number[] = [];

    /** Typed event dispatcher used by chart interaction events. */
    protected _chartEvents!: ChartEvents;
    /** Events explicitly enabled for this chart instance. */
    protected _enabledEvents: ChartEvent[] = [];

    /** Optional fixed numerical domain (for thematic color mapping). */
    protected _domain: [number, number] | undefined = undefined;
    /** Active colormap interpolator used by charts that support color encoding. */
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQUENTIAL_REDS;


    /**
     * Initializes shared chart state from plot configuration.
        *
        * Input feature properties are normalized through `ensureAutkIds` so
        * interaction identity is consistent across all chart implementations.
        *
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
     * @returns Normalized render rows used for mark binding.
     */
    get data(): AutkDatum[] {
        return this._data;
    }

    /**
     * Replaces internal data rows.
     *
     * Incoming rows are normalized to ensure each datum carries `autkIds`.
     *
     * @param data New rendered rows.
     */
    set data(data: GeoJsonProperties[]) {
        this._data = this.ensureAutkIds(data as AutkDatum[]);
    }


    /**
     * Returns selected source ids.
     * @returns Current source ids selected in the chart.
     */
    get selection(): number[] {
        return this._selection;
    }

    /**
     * Updates selected source ids.
     * @param selection Source ids to mark as selected.
     */
    set selection(selection: number[]) {
        this._selection = selection;
    }

    /**
     * Returns the chart event dispatcher.
     * @returns Typed plot event dispatcher for listener registration.
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
     * @param selection Source ids.
     */
    public setSelection(selection: number[]) {
        this._selection = selection;
        this.updateChartSelection();
    }

    /**
     * Resolves source ids from a mark datum using the `autkIds` contract.
     *
     * @param datum Bound mark datum.
        * @returns Source ids represented by the datum, or an empty array.
     */
    protected getDatumAutkIds(datum: unknown): number[] {
        if (datum && typeof datum === 'object') {
            const candidate = (datum as { autkIds?: unknown }).autkIds;
            if (Array.isArray(candidate)) {
                const ids = candidate.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
                if (ids.length > 0) return ids;
            }
        }

        return [];
    }

    /**
     * Ensures every row carries the source-id contract field.
     * @param data Render rows.
        * @returns New rows array with guaranteed `autkIds` values.
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

    /**
     * Renders chart DOM/SVG/HTML nodes for the current internal state.
     */
    abstract render(): void;

    /**
     * Re-applies visual selection state to rendered marks.
     */
    abstract updateChartSelection(): void;
}
