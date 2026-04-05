import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { EventEmitter } from './core-types';
import { ColorMapInterpolator } from './core-types';
import { ChartEvent } from './events-types';
import type { LinechartConfig } from './charts/linechart';

/**
 * Margin values in pixels around the plot drawing area.
 */
export type ChartMargins = { left: number; right: number; top: number; bottom: number };

/**
 * Histogram transformation settings for bar chart rendering.
 */
export type HistogramConfig = {
    column: string;       // nested property path to the value (e.g. 'sjoin.avg.jun')
    numBins: number;      // number of equal-width bins
};

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
 * Temporal events preset config.
 *
 * Defaults are applied internally when `options` or optional attributes are omitted.
 */
export type TemporalEventsTransformConfig = {
    preset: 'temporal-events';
    attributes: {
        events: string;
        timestamp?: string;
        value?: string;
    };
    options?: {
        resolution?: TransformResolution;
        reducer?: TransformReducer;
    };
};

/**
 * Timeseries preset config.
 *
 * Defaults are applied internally when `options` or optional attributes are omitted.
 */
export type TimeseriesTransformConfig = {
    preset: 'timeseries';
    attributes: {
        series: string;
        timestamp?: string;
        value?: string;
    };
    options?: {
        reducer?: TransformReducer;
    };
};

/** Transform preset config accepted by `AutkChart`. */
export type ChartTransformConfig =
    | HistogramTransformConfig
    | TemporalEventsTransformConfig
    | TimeseriesTransformConfig;

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
    histogram?: HistogramConfig,
    tickFormats?: string[], // d3-format specifier per axis, e.g. ['.1f', '.4f']
    /** Explicit data domain `[min, max]` for numerical color encoding. If omitted, computed from the data. */
    domain?: [number, number];
    colorMapInterpolator?: ColorMapInterpolator;
}

/**
 * Standard payload emitted by plot interaction events.
 *
 * `selection` always references source feature indices.
 */
export type ChartSelectionPayload = { selection: number[] };

/**
 * Type mapping ChartEvent enum values to their payload types.
 *
 * All plot interaction events emit a `ChartSelectionPayload` containing
 * source feature indices of the current selection.
 */
export type ChartEventRecord = {
    [ChartEvent.CLICK]: ChartSelectionPayload;
    [ChartEvent.BRUSH]: ChartSelectionPayload;
    [ChartEvent.BRUSH_X]: ChartSelectionPayload;
    [ChartEvent.BRUSH_Y]: ChartSelectionPayload;
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

/**
 * Supported chart variants in the unified autk-plot API.
 */
export type ChartType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart';

type SharedChartConfig = Omit<ChartConfig, 'div'>;

/**
 * Unified configuration for scatter plots.
 */
export type ScatterplotChartConfig = SharedChartConfig & {
    type: 'scatterplot';
    attributes?: [string, string];
};

/**
 * Unified configuration for bar charts.
 */
export type BarchartChartConfig = SharedChartConfig & {
    type: 'barchart';
};

/**
 * Unified configuration for parallel coordinates charts.
 */
export type ParallelCoordinatesChartConfig = SharedChartConfig & {
    type: 'parallel-coordinates';
};

/**
 * Unified configuration for table visualizations.
 */
export type TableChartConfig = SharedChartConfig & {
    type: 'table';
};

/**
 * Unified configuration for line charts.
 */
export type LinechartUnifiedConfig = Omit<LinechartConfig, 'div'> & {
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
