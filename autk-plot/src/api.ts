import type {
    Geometry,
    FeatureCollection,
    GeoJsonProperties,
} from 'geojson';

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
export type ChartMargins = {
    /** Left margin in pixels. */
    left: number;
    /** Right margin in pixels. */
    right: number;
    /** Top margin in pixels. */
    top: number;
    /** Bottom margin in pixels. */
    bottom: number;
};

/**
 * Datum contract bound to interactive marks.
 *
 * `autkIds` must always reference source feature indices from the original
 * input collection (never DOM position indices).
 */
export type AutkDatum = GeoJsonProperties & {
    /** Source feature indices from the original GeoJSON input collection. */
    autkIds?: number[];
};

/**
 * Base configuration accepted by all chart implementations.
 */
export type ChartConfig = {
    /** Host HTML element where the chart renders. */
    div: HTMLElement;
    /** GeoJSON feature collection used as the chart data source. */
    collection: FeatureCollection<Geometry, GeoJsonProperties>;
    /** Interaction events the chart should emit (click, brush, etc). */
    events?: ChartEvent[];
    /** Pixel margins around the plot drawing area. */
    margins?: ChartMargins;
    /** Chart width in pixels. Defaults to the container width. */
    width?: number;
    /** Chart height in pixels. Defaults to the container height. */
    height?: number;
    /** Display labels for axes, title, and color legend. */
    labels?: {
        /** Chart title. */
        title?: string;
        /** Labels for each axis. */
        axis?: string[];
        /** Color legend label. */
        color?: string;
    };
    /** Feature property names to map to visual channels. */
    attributes?: {
        /** Property names mapped to axes. */
        axis?: string[];
        /** Property name mapped to the color channel. */
        color?: string;
    };
    /** Optional data transform applied before rendering. */
    transform?: ChartTransformConfig;
    /** D3 format strings for each axis tick. */
    tickFormats?: string[];
    /** Domain specification controlling how the colormap range is derived. */
    domainSpec?: ColorMapDomainSpec;
    /** Color interpolator used for continuous (numeric) color encoding. */
    colorMapInterpolator?: ColorMapInterpolator;
    /** Color interpolator used when the color attribute contains categorical (string) values. Defaults to `OBSERVABLE10`. */
    categoricalColorMapInterpolator?: ColorMapInterpolator;
};

/**
 * Configuration passed to `AutkChart`. Identical to `ChartConfig` minus `div`,
 * which is supplied as a separate constructor argument, plus a `type` discriminant
 * that selects the chart implementation.
 */
export type UnifiedChartConfig = Omit<ChartConfig, 'div'> & {
    /** Selects which chart implementation to instantiate. */
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
        /** Reducer applied within each bin. Defaults to `'count'`. */
        reducer?: TransformReducer;
        /** Number of bins for quantitative attributes. Defaults to `10`. */
        bins?: number;
        /** Feature property to aggregate for non-count reducers. Required when `reducer` is not `'count'`. */
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
        /** Reducer applied within each cell. Defaults to `'count'`. */
        reducer?: TransformReducer;
        /** Number of bins for the x axis when quantitative. Defaults to `10`. */
        binsX?: number;
        /** Number of bins for the y axis when quantitative. Defaults to `10`. */
        binsY?: number;
        /** Feature property to aggregate for non-count reducers. Required when `reducer` is not `'count'`. */
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
        /** Field within each event object that holds the timestamp. Defaults to `'timestamp'`. */
        timestamp?: string;
        /** Field within each event object used for non-count reducers. Defaults to `'value'`. */
        value?: string;
        /** Granularity of the time buckets. Defaults to `'month'`. */
        resolution?: TransformResolution;
        /** Reducer applied within each bucket. Defaults to `'count'`. */
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
        /** Field within each series point that holds the timestamp. Defaults to `'timestamp'`. */
        timestamp?: string;
        /** Field within each series point that holds the numeric value. Defaults to `'value'`. */
        value?: string;
        /** Reducer applied within each timestamp bucket. Defaults to `'avg'`. */
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
        /** Sort direction. Defaults to `'asc'`. */
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
