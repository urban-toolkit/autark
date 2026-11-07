import type { TransformReducer } from '../api';

/**
 * Minimum row shape expected by `reduceBuckets`.
 *
 * Covers both `AutkDatum` rows and synthetic intermediate rows created by
 * temporal and timeseries presets.
 */
export type Row = { autkIds?: number[]; [key: string]: unknown };

/**
 * Output of a single aggregated bucket after reduction.
 */
export type ReducedBucket = {
    /** The bucket identifier (e.g. `"2024-03"`, `"1k-2k"`). */
    key: string;
    /** The reduced numeric result (count, sum, avg, min, or max). */
    value: number;
    /** How many rows fell into this bucket. */
    count: number;
    /** Merged source feature ids from all rows in this bucket, used for selection linking. */
    autkIds: number[];
};

/**
 * Reduced bucket plus the input rows that were reduced into it.
 */
export type CollectedBucket = ReducedBucket & {
    /** Counted input rows, by index in `rows`, with the value each one contributed (`1` for count). */
    members: { row: number; value: number }[];
};

/** Aggregation options shared by `reduceBuckets` and `collectBuckets`. */
type ReduceBucketsOptions = {
    /** Input rows to aggregate. */
    rows: Row[];
    /** Assigns a bucket key to each row; return `null` to skip the row. */
    bucketOf: (row: Row) => string | null;
    /** Optional numeric extractor used for non-count reducers. */
    valueOf?: (row: Row) => number | null;
    /** Aggregation strategy applied within each bucket. */
    reducer: TransformReducer;
};

/**
 * Groups rows into keyed buckets and reduces each bucket to a single value.
 *
 * @param options Aggregation configuration with `rows`, `bucketOf`, `valueOf`, and `reducer`.
 * @returns Reduced buckets with merged `autkIds` for selection linking.
 * @throws Never throws. Rows with null keys or non-finite values are skipped.
 * @example
 * const buckets = reduceBuckets({
 *   rows: data,
 *   bucketOf: row => String(row.category),
 *   valueOf: row => row.amount,
 *   reducer: 'sum',
 * });
 */
export function reduceBuckets(options: ReduceBucketsOptions): ReducedBucket[] {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return collectBuckets(options).map(({ members, ...bucket }) => bucket);
}

/**
 * Same aggregation as `reduceBuckets`, also returning the counted rows of each
 * bucket so presets can record unit-level provenance.
 *
 * For `count`, pass `valueOf: undefined` explicitly: every object literal
 * inherits `Object.prototype.valueOf`, which TypeScript would otherwise take
 * as the option. At runtime only an own `valueOf` is used.
 *
 * @param options Aggregation configuration with `rows`, `bucketOf`, `valueOf`, and `reducer`.
 * @returns Reduced buckets with their counted member rows.
 * @throws Never throws. Rows with null keys or non-finite values are skipped.
 */
export function collectBuckets(options: ReduceBucketsOptions): CollectedBucket[] {
    const { rows, bucketOf, reducer } = options;
    // Only an own `valueOf` counts: every object literal inherits Object.prototype.valueOf,
    // which would otherwise be called on each row when the option is left out.
    const valueOf = Object.prototype.hasOwnProperty.call(options, 'valueOf') ? options.valueOf : undefined;
    const buckets = new Map<string, {
        count: number;
        sum: number;
        min: number;
        max: number;
        autkIds: Set<number>;
        members: CollectedBucket['members'];
    }>();

    rows.forEach((row, rowIndex) => {
        const key = bucketOf(row);
        if (!key) return;

        const ids = Array.isArray(row.autkIds)
            ? (row.autkIds as number[]).filter(n => typeof n === 'number' && Number.isFinite(n))
            : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];

        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = {
                count: 0,
                sum: 0,
                min: Number.POSITIVE_INFINITY,
                max: Number.NEGATIVE_INFINITY,
                autkIds: new Set<number>(),
                members: [],
            };
            buckets.set(key, bucket);
        }
        const numericValue = valueOf ? valueOf(row) : 1;
        if (numericValue === null || !Number.isFinite(numericValue)) return;

        bucket.count += 1;
        bucket.sum += numericValue;
        bucket.min = Math.min(bucket.min, numericValue);
        bucket.max = Math.max(bucket.max, numericValue);
        bucket.members.push({ row: rowIndex, value: numericValue });

        rowAutkIds.forEach(id => bucket!.autkIds.add(id));
    });

    return Array.from(buckets.entries())
        .map(([key, b]) => {
            let value: number;
            if (reducer === 'count') value = b.count;
            else if (reducer === 'sum') value = b.sum;
            else if (reducer === 'avg') value = b.count > 0 ? b.sum / b.count : 0;
            else if (reducer === 'min') value = b.count > 0 ? b.min : 0;
            else value = b.count > 0 ? b.max : 0;

            return { key, value, count: b.count, autkIds: Array.from(b.autkIds), members: b.members };
        })
        .filter(item => item.count > 0);
}
