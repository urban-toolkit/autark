type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted' | 'collect';

export interface SpatialQueryParams {
  tableRootName: string;
  tableJoinName: string;
  output: {
    type: 'MODIFY_ROOT' | 'CREATE_NEW';
    tableName?: string; // Required if type is 'CREATE_NEW'
  };
  spatialPredicate?: 'INTERSECT' | 'NEAR';
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  nearDistance?: number;
  nearUseCentroid?: boolean; // When true, centroid-to-centroid distance is used. Defaults to true when root table contains polygons.
  groupBy?: {
    selectColumns: Array<{
      tableName: string;
      column: string;
      aggregateFn?: AggregateFunction;
      aggregateFnResultColumnName?: string; // Optional custom name for the aggregation result
      normalize?: boolean; // When true, normalizes the aggregated value between 0 and 1
    }>;
  };
}
