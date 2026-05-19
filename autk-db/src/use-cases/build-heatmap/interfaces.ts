/**
 * Supported aggregation functions for heatmap cell values.
 *
 * @note 'weighted' and 'collect' are handled specially in raster band generation.
 */
export type HeatmapAggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted';

/**
 * Parameters for building a heatmap from spatially joined data.
 *
 * @note Requires a valid bounding box and source table to be passed at execution time.
 */
export interface BuildHeatmapParams {
    /** Name of the source table to join against the grid. */
    tableJoinName: string;
    /** NEAR predicate configuration for heatmap generation. */
    near: { distance: number };
    /** Name of the output table that will hold the heatmap result. */
    outputTableName: string;
    /** Optional group-by columns to aggregate into separate raster bands. */
    groupBy?: Array<{
        /** Column name to aggregate. Use `'*'` for row-level aggregations like `count`. */
        column: string;
        /** Aggregation function to apply on the grouped values. */
        aggregateFn?: HeatmapAggregateFunction;
    }>;
    /** Grid dimensions for the heatmap overlay. */
    grid: {
        /** Number of rows in the output grid. */
        rows: number;
        /** Number of columns in the output grid. */
        columns: number;
    };
}

