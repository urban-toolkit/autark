import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { EventEmitter, ColorMapDomainSpec } from './core-types';
import { ColorMapInterpolator } from './core-types';
import { ChartEvent } from './events-types';


// ---------------------------------------------------------------------------
// Core / shared types
// ---------------------------------------------------------------------------

/**
 * Margin values in pixels around the plot drawing area.
 */
export type ChartMargins = { left: number; right: number; top: number; bottom: number };

/**
 * Datum contract bound to interactive marks.
 *
 * `autkIds` must always reference source feature indices from the original
 * input collection (never DOM position indices).
 */
export type AutkDatum = GeoJsonProperties & {
    autkIds?: number[];
};

/**
 * Base configuration accepted by D3-based plot implementations.
 */
export type ChartConfig = {
    div: HTMLElement,
    collection: FeatureCollection<Geometry, GeoJsonProperties>,
    events?: ChartEvent[],
    margins?: ChartMargins,
    width?: number,
    height?: number,
    labels?: { axis?: string[]; title?: string; color?: string },
    attributes?: { axis?: string[]; color?: string },
    transform?: ChartTransformConfig,
    tickFormats?: string[],
    domainSpec?: ColorMapDomainSpec;
    colorMapInterpolator?: ColorMapInterpolator;
}


// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Type mapping ChartEvent enum values to their payload types.
 *
 * All plot interaction events emit `{ selection: number[] }` containing
 * source feature indices of the current selection.
 */
export type ChartEventRecord = {
    [ChartEvent.CLICK]: { selection: number[] };
    [ChartEvent.BRUSH]: { selection: number[] };
    [ChartEvent.BRUSH_X]: { selection: number[] };
    [ChartEvent.BRUSH_Y]: { selection: number[] };
};

/**
 * Type alias for the EventEmitter used by plot instances.
 *
 * Uses the same event emitter from autk-core as autk-map, ensuring
 * consistent event handling patterns across all visualization libraries.
 *
 * @example
 * const plot = new AutkChart(div, { type: 'scatterplot', ... });
 * plot.events.on(ChartEvent.CLICK, ({ selection }) => {
 *   console.log('Selected features:', selection);
 * });
 */
export type ChartEvents = EventEmitter<ChartEventRecord>;


// ---------------------------------------------------------------------------
// Transform types
// ---------------------------------------------------------------------------

/** Supported reducer names for built-in transform presets. */
export type TransformReducer = 'count' | 'sum' | 'avg' | 'min' | 'max';

/** Supported temporal resolutions for event bucketing presets. */
export type TransformResolution = 'hour' | 'day' | 'weekday' | 'monthday' | 'month' | 'year';

/**
 * Binning-1d preset config.
 *
 * Defaults are applied internally when `options` are omitted.
 */
export type Binning1dTransformConfig = {
    preset: 'binning-1d';
    attributes: {
        value: string;
    };
    options?: {
        reducer?: TransformReducer;
        bins?: number;
    };
};

/**
 * Binning-2d preset config.
 *
 * Groups rows by a pair of categorical dimensions and reduces a numeric value
 * column within each (x, y) cell. Defaults are applied internally when `options` are omitted.
 */
export type Binning2dTransformConfig = {
    preset: 'binning-2d';
    attributes: {
        x: string;
        y: string;
        /** Required for non-count reducers. Omit when `reducer` is `'count'` (the default). */
        value?: string;
    };
    options?: {
        reducer?: TransformReducer;
        /** Number of bins for x when the x attribute is quantitative. Defaults to 10. */
        binsX?: number;
        /** Number of bins for y when the y attribute is quantitative. Defaults to 10. */
        binsY?: number;
    };
};


/**
 * Temporal preset config.
 *
 * Defaults are applied internally when `options` are omitted.
 */
export type TemporalTransformConfig = {
    preset: 'temporal';
    attributes: {
        events: string;
        timestamp: string;
        value: string;
    };
    options?: {
        resolution?: TransformResolution;
        reducer?: TransformReducer;
    };
};

/**
 * Timeseries preset config.
 *
 * Defaults are applied internally when `options` are omitted.
 */
export type TimeseriesTransformConfig = {
    preset: 'timeseries';
    attributes: {
        series: string;
        timestamp: string;
        value: string;
    };
    options?: {
        reducer?: TransformReducer;
    };
};

/**
 * Sort preset config.
 *
 * Reorders rows by a single column without aggregating them.
 * Preserves `autkIds` on every output row.
 */
export type SortTransformConfig = {
    preset: 'sort';
    attributes: {
        column: string;
        direction?: 'asc' | 'desc';
    };
};

/** Transform preset config accepted by `AutkChart`. */
export type ChartTransformConfig =
    | Binning1dTransformConfig
    | Binning2dTransformConfig
    | TemporalTransformConfig
    | TimeseriesTransformConfig
    | SortTransformConfig;


// ---------------------------------------------------------------------------
// Unified chart config types
// ---------------------------------------------------------------------------

/**
 * Supported chart variants in the unified autk-plot API.
 */
export type ChartType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart' | 'heatmatrix';

/**
 * Configuration passed to `AutkChart`. Identical to `ChartConfig` minus `div`,
 * which is supplied as a separate constructor argument.
 */
export type UnifiedChartConfig = Omit<ChartConfig, 'div'> & {
    type: ChartType;
};
