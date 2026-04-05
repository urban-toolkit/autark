export type TransformResolution = 'hour' | 'day' | 'weekday' | 'monthday' | 'month' | 'year';

export type TransformReducerName = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type TransformRow = {
    autkIds?: number[];
    [key: string]: unknown;
};

export type ReducedBucket = {
    key: string;
    value: number;
    count: number;
    autkIds: number[];
};

export type ReduceBucketsOptions<T extends TransformRow> = {
    rows: T[];
    bucketOf: (row: T) => string | null;
    valueOf?: (row: T) => number | null;
    reducer: TransformReducerName;
    fallbackAutkIdFromRowIndex?: boolean;
};

type ReducerState = {
    count: number;
    sum: number;
    min: number;
    max: number;
};

const createReducerState = (): ReducerState => ({
    count: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
});

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
 * Merges source feature ids preserving uniqueness.
 */
export function mergeAutkIds(base: number[], incoming: number[]): number[] {
    if (incoming.length === 0) return base;
    if (base.length === 0) return Array.from(new Set(incoming));
    return Array.from(new Set([...base, ...incoming]));
}

/**
 * Applies one of the built-in reducers to a reducer state.
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
