type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface BuildHeatmapParams {
    tableJoinName: string;
    nearDistance: number;
    outputTableName: string;
    groupBy?: {
        selectColumns: Array<{
            tableName: string;
            column: string;
            aggregateFn?: AggregateFunction;
            aggregateFnResultColumnName?: string;
        }>;
    };
    grid: {
        rows: number;
        columns: number;
    };
}

