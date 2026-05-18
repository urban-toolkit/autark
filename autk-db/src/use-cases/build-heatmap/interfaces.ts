export type HeatmapAggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted';

export interface BuildHeatmapParams {
    tableJoinName: string;
    nearDistance: number;
    outputTableName: string;
    groupBy?: {
        selectColumns: Array<{
            /** Column name to aggregate. Use `'*'` for row-level aggregations like `count`. */
            column: string;
            /** Aggregation function. */
            aggregateFn?: HeatmapAggregateFunction;
        }>;
    };
    grid: {
        rows: number;
        columns: number;
    };
}

