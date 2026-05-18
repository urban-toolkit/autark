export type AggregateFunction ='sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted' | 'collect';

/** Configuration for the NEAR spatial predicate. */
export interface NearConfig {
  /** Maximum search distance. */
  distance: number;
  /** When `true`, uses centroid-to-centroid distance. Defaults to `true`. */
  useCentroid?: boolean;
}

/**
 * Parameters for a spatial join between two tables.
 *
 * The join always modifies the root table in place using a LEFT join.
 * Aggregated results are stored under `properties.sjoin.<aggregateFn>.<key>` in the root table.
 */
export interface SpatialQueryParams {
  /** Name of the root table that will be modified in place. */
  tableRootName: string;
  /** Name of the table to join against the root. */
  tableJoinName: string;
  /** NEAR predicate configuration. When present, the join searches for features within a specified distance. */
  near?: NearConfig;
  /** Optional aggregation applied to join-side data. Keys are derived from `tableJoinName` and the aggregate function. */
  groupBy?: Array<{
    /** Column name to aggregate. Use `'*'` for row-level aggregations like `count`. */
    column: string;
    /** Aggregation function. Omit to pass the column through without aggregation. */
    aggregateFn?: AggregateFunction;
    /** When `true`, normalizes the aggregated value between 0 and 1. */
    normalize?: boolean;
  }>;
}
