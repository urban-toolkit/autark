/**
 * Supported temporal resolutions used by the temporal transform preset.
 *
 * Controls the granularity at which event timestamps are bucketed.
 */
export type TransformResolution = 'hour' | 'day' | 'weekday' | 'monthday' | 'month' | 'year';

/**
 * Supported reducer names used when aggregating values within a bucket.
 */
export type TransformReducerName = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * Minimum row shape expected by transform kernel functions.
 *
 * All transform presets operate on rows that optionally carry `autkIds` for
 * source feature provenance.
 */
export type TransformRow = {
    autkIds?: number[];
    [key: string]: unknown;
};

/**
 * Output of a single aggregated bucket after reduction.
 *
 * `autkIds` contains all source feature ids that contributed to this bucket.
 */
export type ReducedBucket = {
    key: string;
    value: number;
    count: number;
    autkIds: number[];
};

/**
 * Options accepted by `reduceBuckets`.
 *
 * @template T Row type extending `TransformRow`.
 */
export type ReduceBucketsOptions<T extends TransformRow> = {
    /** Input rows to aggregate. */
    rows: T[];
    /** Returns the bucket key for a row, or `null` to skip the row. */
    bucketOf: (row: T) => string | null;
    /** Returns the numeric value used by the reducer. Defaults to `1` when omitted (count). */
    valueOf?: (row: T) => number | null;
    /** Reducer to apply within each bucket. */
    reducer: TransformReducerName;
    /**
     * When `true` (default), a row without `autkIds` falls back to its array index
     * as the source id. Set to `false` to omit source tracking for synthetic rows.
     */
    fallbackAutkIdFromRowIndex?: boolean;
};

/**
 * Mutable accumulator updated per-row during bucket reduction.
 */
type ReducerState = {
    count: number;
    sum: number;
    min: number;
    max: number;
};

/**
 * Creates a new reducer state object with initial values.
 *
 * @returns ReducerState with zeroed count/sum and infinite min/max
 */
const createReducerState = (): ReducerState => ({
    count: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
});

/**
 * Normalizes autkIds from a candidate value, falling back to the row index if needed.
 *
 * @param candidate Value to check for autkIds (should be an array)
 * @param fallbackIndex Row index to use if candidate is missing/invalid
 * @returns Array of source ids
 */
const normalizeAutkIds = (candidate: unknown, fallbackIndex: number | null): number[] => {
    const ids = Array.isArray(candidate)
        ? candidate.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
        : [];

    if (ids.length > 0) {
        return ids;
    }

    return fallbackIndex === null ? [] : [fallbackIndex];
};

/**
 * Merges two arrays of source feature ids, preserving uniqueness.
 *
 * Used to track provenance of features through aggregation steps.
 *
 * @param base Existing source ids
 * @param incoming New source ids to merge
 * @returns Unique array of source ids
 */
export function mergeAutkIds(base: number[], incoming: number[]): number[] {
    if (incoming.length === 0) return base;
    if (base.length === 0) return Array.from(new Set(incoming));
    return Array.from(new Set([...base, ...incoming]));
}

/**
 * Applies one of the built-in reducers to a reducer state.
 *
 * Supported reducers: 'count', 'sum', 'avg', 'min', 'max'.
 *
 * @param state Current reducer state
 * @param reducer Reducer name
 * @returns Final reduced value
 */
export function finalizeReducerValue(state: ReducerState, reducer: TransformReducerName): number {
    if (reducer === 'count') return state.count;
    if (reducer === 'sum') return state.sum;
    if (reducer === 'avg') return state.count > 0 ? state.sum / state.count : 0;
    if (reducer === 'min') return state.count > 0 ? state.min : 0;
    return state.count > 0 ? state.max : 0;
}

/**
 * Reduces rows into keyed buckets while preserving source feature provenance.
 *
 * Groups rows by a bucket key, applies the specified reducer, and merges autkIds for provenance.
 *
 * @param options Reduction options (bucketOf, valueOf, reducer, etc)
 * @returns Array of reduced buckets
 */
export function reduceBuckets<T extends TransformRow>(options: ReduceBucketsOptions<T>): ReducedBucket[] {
    const {
        rows,
        bucketOf,
        valueOf,
        reducer,
        fallbackAutkIdFromRowIndex = true,
    } = options;

    const buckets = new Map<string, { state: ReducerState; autkIds: number[] }>();

    rows.forEach((row, rowIndex) => {
        const key = bucketOf(row);
        if (!key) return;

        const fallbackIndex = fallbackAutkIdFromRowIndex ? rowIndex : null;
        const rowAutkIds = normalizeAutkIds(row.autkIds, fallbackIndex);

        if (!buckets.has(key)) {
            buckets.set(key, { state: createReducerState(), autkIds: [] });
        }

        const bucket = buckets.get(key);
        if (!bucket) return;

        const numericValue = valueOf ? valueOf(row) : 1;
        if (numericValue === null || !Number.isFinite(numericValue)) return;

        bucket.state.count += 1;
        bucket.state.sum += numericValue;
        bucket.state.min = Math.min(bucket.state.min, numericValue);
        bucket.state.max = Math.max(bucket.state.max, numericValue);
        bucket.autkIds = mergeAutkIds(bucket.autkIds, rowAutkIds);
    });

    return Array.from(buckets.entries())
        .map(([key, bucket]) => ({
            key,
            value: finalizeReducerValue(bucket.state, reducer),
            count: bucket.state.count,
            autkIds: bucket.autkIds,
        }))
        .filter(item => item.count > 0);
}
