export type HeatmapAggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted';

export interface BuildHeatmapParams {
    tableJoinName: string;
    nearDistance: number;
    outputTableName: string;
    groupBy?: {
        selectColumns: Array<{
            tableName: string;
            column: string;
            aggregateFn?: HeatmapAggregateFunction;
            aggregateFnResultColumnName?: string;
        }>;
    };
    grid: {
        rows: number;
        columns: number;
    };
}

