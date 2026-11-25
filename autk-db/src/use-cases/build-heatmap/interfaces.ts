import type { AggregateFunction, NearConfig } from '../spatial-join/interfaces';

/**
 * Supported aggregation functions for heatmap cell values.
 */
export type HeatmapAggregateFunction = Exclude<AggregateFunction, 'collect'>;

/** Shared heatmap group-by item, aligned with `spatialQuery` except that `collect` is not supported. */
export interface HeatmapGroupBy {
    /** Column name to aggregate. Use `'*'` for row-level aggregations like `count`. */
    column: string;
    /** Required aggregation function for the cell's value. */
    aggregateFn: HeatmapAggregateFunction;
    /** When `true`, normalizes the aggregated value between 0 and 1. */
    normalize?: boolean;
}

/**
 * Parameters for building a heatmap from spatially joined data.
 *
 * @remarks Requires a valid bounding box and source table to be passed at execution time.
 */
export interface BuildHeatmapParams {
    /** Name of the source table to join against the grid. */
    tableJoinName: string;
    /** NEAR predicate configuration for heatmap generation. */
    near: NearConfig;
    /** Name of the output table that will hold the heatmap result. */
    outputTableName: string;
    /** Columns to aggregate into separate bands. Omit or pass an empty list to count nearby rows. */
    groupBy?: HeatmapGroupBy[];
    /** Gaussian standard deviation in grid cells (0–32). Applied to each band after aggregation and normalization. Defaults to 0 (no smoothing). */
    smoothingSigma?: number;
    /** Grid dimensions for the heatmap overlay. */
    grid: {
        /** Number of rows in the output grid. */
        rows: number;
        /** Number of columns in the output grid. */
        columns: number;
    };
}

