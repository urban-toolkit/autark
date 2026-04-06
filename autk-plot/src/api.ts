import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { EventEmitter } from './core-types';
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
    labels?: { axis: string[]; title: string },
    attributes?: string[],
    transform?: ChartTransformConfig,
    tickFormats?: string[], // d3-format specifier per axis, e.g. ['.1f', '.4f']
    /** Explicit data domain `[min, max]` for numerical color encoding. If omitted, computed from the data. */
    domain?: [number, number];
    colorMapInterpolator?: ColorMapInterpolator;
    /** Optional start year for time-based charts (linechart, etc). */
    startYear?: number;
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
 * Histogram preset config.
 *
 * Defaults are applied internally when `options` are omitted.
 */
export type HistogramTransformConfig = {
    preset: 'histogram';
    attributes: {
        value: string;
    };
    options?: {
        bins?: number;
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

/** Transform preset config accepted by `AutkChart`. */
export type ChartTransformConfig =
    | HistogramTransformConfig
    | TemporalTransformConfig
    | TimeseriesTransformConfig;


// ---------------------------------------------------------------------------
// Unified chart config types
// ---------------------------------------------------------------------------

/**
 * Supported chart variants in the unified autk-plot API.
 */
export type ChartType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart';

/**
 * Unified configuration for scatter plots.
 */
export type ScatterplotChartConfig = Omit<ChartConfig, 'div'> & {
    type: 'scatterplot';
    attributes?: [string, string];
};

/**
 * Unified configuration for bar charts.
 */
export type BarchartChartConfig = Omit<ChartConfig, 'div'> & {
    type: 'barchart';
};

/**
 * Unified configuration for parallel coordinates charts.
 */
export type ParallelCoordinatesChartConfig = Omit<ChartConfig, 'div'> & {
    type: 'parallel-coordinates';
};

/**
 * Unified configuration for table visualizations.
 */
export type TableChartConfig = Omit<ChartConfig, 'div'> & {
    type: 'table';
};

/**
 * Unified configuration for line charts.
 */
export type LinechartUnifiedConfig = Omit<ChartConfig, 'div'> & {
    type: 'linechart';
};

/**
 * Discriminated union describing all supported unified chart configurations.
 */
export type UnifiedChartConfig =
    | ScatterplotChartConfig
    | BarchartChartConfig
    | ParallelCoordinatesChartConfig
    | TableChartConfig
    | LinechartUnifiedConfig;
