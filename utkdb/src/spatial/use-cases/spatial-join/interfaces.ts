type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface SpatialJoinParams {
  tableRootName: string;
  tableJoinName: string;
  outputTableName: string;
  spatialPredicate?: 'INTERSECT' | 'NEAR';
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  nearDistance?: number;
  groupBy?: {
    selectColumns: Array<{ tableName: string; column: string; aggregateFn?: AggregateFunction }>;
  };
}
