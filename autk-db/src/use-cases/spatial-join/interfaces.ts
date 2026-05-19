/**
 * Supported aggregation functions for spatial join results.
 *
 * Used within `groupBy` to compute aggregate values from join-side data.
 *
 * @example
 * const fn: AggregateFunction = 'count';
 */
export type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted' | 'collect';

/**
 * Configuration for the NEAR spatial predicate.
 *
 * When provided, the spatial join finds features within the specified distance
 * rather than using geometric intersection.
 *
 * @example
 * const near: NearConfig = { distance: 1000, useCentroid: true };
 */
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
 *
 * @example
 * await db.spatialQuery({ tableRootName: 'roads', tableJoinName: 'noise' });
 * @example
 * await db.spatialQuery({
 *   tableRootName: 'neighborhoods',
 *   tableJoinName: 'schools',
 *   near: { distance: 500 },
 *   groupBy: [{ column: 'name', aggregateFn: 'count' }],
 * });
 */
export interface SpatialQueryParams {
  /** Name of the root table that will be modified in place. */
  tableRootName: string;
  /** Name of the table to join against the root. */
  tableJoinName: string;
  /**
   * NEAR predicate configuration. When present, the join uses `'NEAR'` instead of `'INTERSECT'`.
   * Finds features within the specified distance from root geometries.
   */
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
