import type {
    Geometry,
    FeatureCollection,
    GeoJsonProperties,
} from 'geojson';

import type { ColorMapDomainSpec } from './types-core';
import type { ColorMapInterpolator } from './types-core';

import type { PlotEvent } from './types-events';


// ---------------------------------------------------------------------------
// Core / shared types
// ---------------------------------------------------------------------------

/**
 * Supported plot variants in the unified autk-plot API.
 */
export type PlotType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart' | 'heatmatrix';

/**
 * Margin values in pixels around the plot drawing area.
 */
export type PlotMargins = {
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
 * Base configuration accepted by all plot implementations.
 */
export type PlotConfig = {
    /** Host HTML element where the plot renders. */
    div: HTMLElement;
    /** GeoJSON feature collection used as the plot data source. */
    collection: FeatureCollection<Geometry, GeoJsonProperties>;
    /** Interaction events the plot should emit (click, brush, etc). */
    events?: PlotEvent[];
    /** Pixel margins around the plot drawing area. */
    margins?: PlotMargins;
    /** Plot width in pixels. Defaults to `800`. */
    width?: number;
    /** Plot height in pixels. Defaults to `500`. */
    height?: number;
    /** Display labels for axes, title, and color legend. */
    labels?: {
        /** Plot title. */
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
    transform?: PlotTransformConfig;
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
 * Configuration passed to `AutkPlot`. Identical to `PlotConfig` minus `div`,
 * which is supplied as a separate constructor argument, plus a `type` discriminant
 * that selects the plot implementation.
 */
export type UnifiedPlotConfig = Omit<PlotConfig, 'div'> & {
    /** Selects which plot implementation to instantiate. */
    type: PlotType;
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
 * The column to bin is read from `PlotConfig.attributes.axis[0]`.
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
 * The x and y columns are read from `PlotConfig.attributes.axis[0]` and `axis[1]`.
 * Use `'@transform'` in `PlotConfig.attributes.color` to mark the output slot.
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
 * Binning-events preset config.
 *
 * The events array column is read from `PlotConfig.attributes.axis[0]`.
 * Use `'@transform'` in `axis[1]` to mark the output slot.
 * `timestamp` and `value` are sub-fields within each event object.
 */
export type BinningEventsTransformConfig = {
    preset: 'binning-events';
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
 * Reduce-series preset config.
 *
 * The series array column is read from `PlotConfig.attributes.axis[0]`.
 * Use `'@transform'` in `axis[1]` to mark the output slot.
 * `timestamp` and `value` are sub-fields within each series point.
 * Unlike `binning-events`, timestamps are used as-is with no resolution bucketing.
 */
export type ReduceSeriesTransformConfig = {
    preset: 'reduce-series';
    options?: {
        /** Field within each series point that holds the timestamp. Defaults to `'timestamp'`. */
        timestamp?: string;
        /** Field within each series point that holds the numeric value. Defaults to `'value'`. */
        value?: string;
        /** Reducer applied across features sharing the same timestamp. Defaults to `'avg'`. */
        reducer?: TransformReducer;
    };
};

/**
 * Sort preset config.
 *
 * Reorders rows by a single column without aggregating them.
 * Preserves `autkIds` on every output row.
 * Using `'@transform'` in `PlotConfig.attributes` with sort throws an error.
 */
export type SortTransformConfig = {
    preset: 'sort';
    options?: {
        /** Column to sort by. Defaults to `PlotConfig.attributes.axis[0]`. */
        column?: string;
        /** Sort direction. Defaults to `'asc'`. */
        direction?: 'asc' | 'desc';
    };
};

/** Transform preset config accepted by `AutkPlot`. */
export type PlotTransformConfig =
    | Binning1dTransformConfig
    | Binning2dTransformConfig
    | BinningEventsTransformConfig
    | ReduceSeriesTransformConfig
    | SortTransformConfig;
