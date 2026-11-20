import type { AggregateFunction, NearConfig } from '../spatial-join/interfaces';

/**
 * Supported aggregation functions for heatmap cell values.
 */
export type HeatmapAggregateFunction = Exclude<AggregateFunction, 'collect'>;

/** Shared heatmap group-by item, aligned with `spatialQuery` except that `collect` is not supported. */
export interface HeatmapGroupBy {
    /** Column name to aggregate. Use `'*'` for row-level aggregations like `count`. */
    column: string;
    /** Aggregation function to apply on the grouped values. */
    aggregateFn?: HeatmapAggregateFunction;
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
    /**
     * Optional group-by columns to aggregate into separate raster bands. Without it, or when it is empty, one band
     * counts the rows near each cell, as `[{ column: '*', aggregateFn: 'count' }]` does.
     */
    groupBy?: HeatmapGroupBy[];
    /** Grid dimensions for the heatmap overlay. */
    grid: {
        /** Number of rows in the output grid. */
        rows: number;
        /** Number of columns in the output grid. */
        columns: number;
    };
}

