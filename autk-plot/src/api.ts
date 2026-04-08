import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { ColorMapDomainSpec } from './core-types';
import { ColorMapInterpolator } from './core-types';
import type { ChartEvent } from './events-types';


// ---------------------------------------------------------------------------
// Core / shared types
// ---------------------------------------------------------------------------

/**
 * Supported chart variants in the unified autk-plot API.
 */
export type ChartType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart' | 'heatmatrix';

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

/**
 * Configuration passed to `AutkChart`. Identical to `ChartConfig` minus `div`,
 * which is supplied as a separate constructor argument.
 */
export type UnifiedChartConfig = Omit<ChartConfig, 'div'> & {
    type: ChartType;
};

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
 * The column to bin is read from `ChartConfig.attributes.axis[0]`.
 * Use `'@transform'` in `axis[1]` to mark the output slot.
 */
export type Binning1dTransformConfig = {
    preset: 'binning-1d';
    options?: {
        reducer?: TransformReducer;
        bins?: number;
        /** Aggregate column for non-count reducers. Required when reducer is not 'count'. */
        value?: string;
    };
};

/**
 * Binning-2d preset config.
 *
 * The x and y columns are read from `ChartConfig.attributes.axis[0]` and `axis[1]`.
 * Use `'@transform'` in `ChartConfig.attributes.color` to mark the output slot.
 */
export type Binning2dTransformConfig = {
    preset: 'binning-2d';
    options?: {
        reducer?: TransformReducer;
        /** Number of bins for x when the x attribute is quantitative. Defaults to 10. */
        binsX?: number;
        /** Number of bins for y when the y attribute is quantitative. Defaults to 10. */
        binsY?: number;
        /** Aggregate column for non-count reducers. Required when reducer is not 'count'. */
        value?: string;
    };
};

/**
 * Temporal preset config.
 *
 * The events array column is read from `ChartConfig.attributes.axis[0]`.
 * Use `'@transform'` in `axis[1]` to mark the output slot.
 * `timestamp` and `value` are sub-fields within each event object.
 */
export type TemporalTransformConfig = {
    preset: 'temporal';
    options?: {
        /** Timestamp field within each event object. */
        timestamp?: string;
        /** Value field within each event for non-count reducers. */
        value?: string;
        resolution?: TransformResolution;
        reducer?: TransformReducer;
    };
};

/**
 * Timeseries preset config.
 *
 * The series array column is read from `ChartConfig.attributes.axis[0]`.
 * Use `'@transform'` in `axis[1]` to mark the output slot.
 * `timestamp` and `value` are sub-fields within each series point.
 */
export type TimeseriesTransformConfig = {
    preset: 'timeseries';
    options?: {
        /** Timestamp field within each series point. */
        timestamp?: string;
        /** Value field within each series point. */
        value?: string;
        reducer?: TransformReducer;
    };
};

/**
 * Sort preset config.
 *
 * Reorders rows by a single column without aggregating them.
 * Preserves `autkIds` on every output row.
 * Using `'@transform'` in `ChartConfig.attributes` with sort throws an error.
 */
export type SortTransformConfig = {
    preset: 'sort';
    options?: {
        /** Column to sort by. Defaults to `ChartConfig.attributes.axis[0]`. */
        column?: string;
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

