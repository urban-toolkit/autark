import type {
    Geometry,
    FeatureCollection,
    GeoJsonProperties,
} from 'geojson';

import type { ColorMapDomainSpec } from '@urban-toolkit/autk-core';
import type { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import type { PlotEvent } from './types-events';


// ---------------------------------------------------------------------------
// Core / shared types
// ---------------------------------------------------------------------------

/**
 * Supported plot variants in the unified autk-plot API.
 */
export type PlotType =
    | 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart' | 'heatmatrix'
    | 'boxplot' | 'sankey'
    | 'pie' | 'donut' | 'areachart' | 'bubble' | 'hexbin' | 'calendar' | 'waffle'
    | 'stackedbar' | 'treemap' | 'sunburst' | 'radar' | 'ecdf' | 'pareto' | 'chord'
    | 'density' | 'violin'
    | 'registered';

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
    /**
     * Plot width in pixels, or `'auto'` to fill the content width of `div` and
     * redraw when it changes (the selection is kept). Defaults to `800`, which
     * is also the width of `'auto'` while `div` has no layout.
     */
    width?: number | 'auto';
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
    /** Name of a plot registered with `registerPlot`, used with `type: 'registered'`. */
    plot?: string;
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
    /** Provenance options. */
    provenance?: PlotProvenanceConfig;
    /**
     * Keeps only source features matching every condition, before the
     * transform runs. Excluded features have no image in the provenance graph.
     */
    filter?: FilterCondition | FilterCondition[];
    /**
     * Keeps only the `k` rendered rows with the highest value (`attributes.axis[1]`),
     * after the transform runs. Supported by the barchart.
     */
    topK?: TopKConfig;
};

/**
 * A condition on a source feature property, used by `PlotConfig.filter`.
 */
export type FilterCondition = {
    /** Dot-path feature property to test. */
    attribute: string;
    /** Comparison operator. Ordering operators compare numbers; equality and membership compare strings. */
    op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not-in';
    /** Value to compare against; a list for `in` and `not-in`. */
    value: number | string | (number | string)[];
};

/**
 * Top-k options, used by `PlotConfig.topK`.
 */
export type TopKConfig = {
    /** Number of rows to keep, ranked by value. */
    k: number;
    /**
     * Gathers the remaining rows into one extra row instead of dropping them.
     * `true` labels it `Others`; a string sets the label. Defaults to `false`.
     */
    others?: boolean | string;
};

/**
 * Provenance options accepted by all plot implementations.
 */
export type PlotProvenanceConfig = {
    /**
     * Shows a compact provenance path widget under the plot, with the stages
     * `D0 … M` reached by the current selection. `'open'` starts with the path
     * expanded. Defaults to `false`, so the plot keeps the height its host gives it.
     */
    path?: boolean | 'open';
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
    | SortTransformConfig
    | BoxStatsTransformConfig
    | FlowsTransformConfig
    | BinningHexTransformConfig
    | HierarchyTransformConfig
    | CumulativeTransformConfig
    | FoldTransformConfig
    | DensityTransformConfig
    | RegisteredTransformConfig;

/**
 * Config of a user-defined transform added with `registerTransform`.
 *
 * The transform receives `options` and the source columns of
 * `PlotConfig.attributes.axis`, and must return rows of its declared shape with
 * provenance that honors the contract checked by `checkTransform`.
 */
export type RegisteredTransformConfig = {
    preset: 'registered';
    /** Name given to `registerTransform`. */
    name: string;
    /** Options passed to the transform. */
    options?: Record<string, unknown>;
};

/**
 * Density preset config (kernel density estimate).
 *
 * Reads a numeric column (`PlotConfig.attributes.axis[0]`), or a group and a
 * numeric column (`axis[0]`, `axis[1]`) for one curve per group. Every row
 * spreads over the grid points within one bandwidth of its value with real
 * weights (fractional coverage), and each curve integrates to 1.
 */
export type DensityTransformConfig = {
    preset: 'density';
    options?: {
        /** Kernel bandwidth, in units of the numeric column. Defaults to Silverman's rule for the Epanechnikov kernel. */
        bandwidth?: number;
        /** Grid points per curve. Defaults to `48`. */
        points?: number;
    };
};

/**
 * Hierarchy preset config.
 *
 * Groups rows by the categorical columns in `PlotConfig.attributes.axis`, from
 * the top level (`axis[0]`) down: e.g. district → land use. Every level is a
 * partition of the level below, so features, leaves, and parents relate `N:1`
 * along the whole chain.
 */
export type HierarchyTransformConfig = {
    preset: 'hierarchy';
    options?: {
        /** Reducer applied within each node. Defaults to `'count'`. */
        reducer?: TransformReducer;
        /** Feature property to aggregate for non-count reducers. Required when `reducer` is not `'count'`. */
        value?: string;
    };
};

/**
 * Cumulative preset config.
 *
 * Partitions rows by `PlotConfig.attributes.axis[0]` into ordered bars and
 * accumulates them: point `k` reduces the rows of bars `0…k`. Numeric columns
 * are ordered by value (an empirical cumulative distribution); categorical
 * columns by reduced value, largest first (a Pareto chart).
 */
export type CumulativeTransformConfig = {
    preset: 'cumulative';
    options?: {
        /** Additive reducer applied within each bar. Defaults to `'count'`. */
        reducer?: 'count' | 'sum';
        /** Feature property to aggregate for `sum`. */
        value?: string;
        /**
         * Number of equal-width bins for numeric columns. By default every
         * distinct value is a step, up to 100 values; larger columns use 50 bins.
         */
        bins?: number;
        /** Bar order: `'key'` (ascending value or label) or `'value'` (largest first). */
        order?: 'key' | 'value';
    };
};

/**
 * Fold preset config.
 *
 * Reads a categorical column (`PlotConfig.attributes.axis[0]`) and one or more
 * numeric measures (`axis[1…]`). Each row unfolds into one unit per measure
 * (`1:N`), and units are reduced per category and measure (`N:1`).
 */
export type FoldTransformConfig = {
    preset: 'fold';
    options?: {
        /** Reducer applied within each category and measure. Defaults to `'avg'`. */
        reducer?: TransformReducer;
        /** Rescales each measure to `[0, 1]` over all rows before reducing. Defaults to `true`. */
        normalize?: boolean;
    };
};

/**
 * Binning-hex preset config.
 *
 * Groups rows into hexagons by the numeric columns in
 * `PlotConfig.attributes.axis[0]` (x) and `axis[1]` (y). Hexagons are regular
 * in pixels: values are mapped to a `width × height` area first. The `hexbin`
 * plot sets `width` and `height` to its drawing area.
 */
export type BinningHexTransformConfig = {
    preset: 'binning-hex';
    options?: {
        /** Reducer applied within each hexagon. Defaults to `'count'`. */
        reducer?: TransformReducer;
        /** Feature property to aggregate for non-count reducers. Required when `reducer` is not `'count'`. */
        value?: string;
        /** Hexagon radius in pixels. Defaults to `14`. */
        radius?: number;
        /** Width of the binned area in pixels. Defaults to `800`. */
        width?: number;
        /** Height of the binned area in pixels. Defaults to `500`. */
        height?: number;
    };
};

/**
 * Flows preset config.
 *
 * Reads an ordered list of categorical columns from `PlotConfig.attributes.axis`
 * (at least two). Every row follows a path through one category per column;
 * consecutive steps of equal paths are reduced into links, and categories into
 * nodes. Each row contributes one segment per step, so rows and links relate
 * `N:N` through the segments.
 */
export type FlowsTransformConfig = {
    preset: 'flows';
    options?: {
        /** Reducer applied within each link and node. Defaults to `'count'`. */
        reducer?: TransformReducer;
        /** Feature property to aggregate for non-count reducers. Required when `reducer` is not `'count'`. */
        value?: string;
    };
};


/**
 * Box-stats preset config.
 *
 * Groups rows by the categorical column in `PlotConfig.attributes.axis[0]`
 * and summarizes the numeric column in `axis[1]` with quartiles, Tukey
 * whiskers, and outliers. Rows with non-finite values are skipped.
 */
export type BoxStatsTransformConfig = {
    preset: 'box-stats';
    options?: {
        /** Whisker length as a multiple of the interquartile range. Defaults to `1.5`. */
        whisker?: number;
    };
};
