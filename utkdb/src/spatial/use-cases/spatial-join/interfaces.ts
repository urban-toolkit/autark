type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface SpatialJoinParams {
  tableRootName: string;
  tableJoinName: string;
  output: {
    type: 'MODIFY_ROOT' | 'CREATE_NEW';
    tableName?: string; // Required if type is 'CREATE_NEW'
  };
  spatialPredicate?: 'INTERSECT' | 'NEAR';
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  nearDistance?: number;
  groupBy?: {
    selectColumns: Array<{
      tableName: string;
      column: string;
      aggregateFn?: AggregateFunction;
      aggregateFnResultColumnName?: string; // Optional custom name for the aggregation result
    }>;
  };
}
