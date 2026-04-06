/**
 * Temporal transform preset.
 *
 * Flattens nested event arrays from feature properties, buckets them by
 * timestamp at a configurable resolution, and reduces each bucket to a single
 * value. Source feature provenance (`autkIds`) is merged across all events
 * that fall into a bucket.
 */

import { valueAtPath } from '../../core-types';

import type { AutkDatum, TemporalTransformConfig } from '../../api';
import type { TransformRow, TransformReducerName, TransformResolution } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runTemporal`.
 *
 * Carries the fixed attribute tuple `['bucket', 'value']` and the bucketed
 * rows ready for line-chart rendering.
 */
export type ExecutedTemporalTransform = {
    preset: 'temporal';
    attributes: ['bucket', 'value'];
    rows: TemporalBucketRow[];
};

/**
 * Runs a temporal transform and returns chart-ready rows.
 *
 * Aggregates nested event collections into temporal buckets using the specified resolution and reducer.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Temporal transform configuration
 * @returns Executed temporal transform result
 */
export function runTemporal(rows: AutkDatum[], config: TemporalTransformConfig): ExecutedTemporalTransform {
    const resolution = config.options?.resolution ?? 'month';
    const reducer = config.options?.reducer ?? 'count';
    return {
        preset: 'temporal',
        attributes: ['bucket', 'value'],
        rows: presetTemporal({
            rows,
            resolution,
            reducer,
            eventsOf: (row) => {
                const value = valueAtPath(row, config.attributes.events);
                return Array.isArray(value) ? value : [];
            },
            timestampOf: (event) => {
                if (!event || typeof event !== 'object') return undefined;
                const value = valueAtPath(event as Record<string, unknown>, config.attributes.timestamp);
                return value instanceof Date || typeof value === 'string' || typeof value === 'number' ? value : undefined;
            },
            valueOf: reducer === 'count'
                ? undefined
                : (event) => {
                    if (!event || typeof event !== 'object') return null;
                    const value = valueAtPath(event as Record<string, unknown>, config.attributes.value);
                    const numericValue = Number(value);
                    return Number.isFinite(numericValue) ? numericValue : null;
                },
        }),
    };
}

// ---- Preset algorithm ---------------------------------------------------

/**
 * Options accepted by `presetTemporal`.
 *
 * @template T Row type extending `TransformRow`.
 * @template E Event object type stored in each row.
 */
export type TemporalPresetOptions<T extends TransformRow, E> = {
    /** Input feature rows. */
    rows: T[];
    /** Returns the array of events for a row, or `null`/`undefined` for none. */
    eventsOf: (row: T) => E[] | null | undefined;
    /** Extracts the timestamp from an event object. */
    timestampOf: (event: E) => Date | string | number | null | undefined;
    /** Temporal resolution controlling bucket granularity. */
    resolution: TransformResolution;
    /** Reducer applied within each bucket. Defaults to `'count'`. */
    reducer?: TransformReducerName;
    /** Extracts the numeric value used by the reducer. Required for non-count reducers. */
    valueOf?: (event: E) => number | null | undefined;
};

/**
 * A single temporal bucket row ready for chart rendering.
 *
 * `bucket` is a formatted string key (e.g. `"2024-03"` for monthly resolution).
 */
export type TemporalBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

/**
 * Aggregates nested event collections into temporal buckets.
 *
 * Flattens all events, assigns them to buckets by timestamp and resolution, then reduces by bucket.
 *
 * @param options Temporal preset options (rows, eventsOf, timestampOf, resolution, reducer, valueOf)
 * @returns Array of reduced temporal buckets
 */
export function presetTemporal<T extends TransformRow, E>(
    options: TemporalPresetOptions<T, E>
): TemporalBucketRow[] {
    const reducer = options.reducer ?? 'count';
    const eventRows = toTemporalRows(options);

    const reduced = reduceBuckets({
        rows: eventRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: (row) => {
            if (reducer === 'count') return 1;
            const value = row.__value;
            return typeof value === 'number' && Number.isFinite(value) ? value : null;
        },
        reducer,
    });

    return reduced.map(item => ({
        bucket: item.key,
        value: item.value,
        count: item.count,
        autkIds: item.autkIds,
    }));
}

/**
 * Formats a date into a string bucket key according to the specified temporal resolution.
 *
 * Supported resolutions: 'hour', 'day', 'weekday', 'monthday', 'month', 'year'.
 *
 * @param date Date object to format
 * @param resolution Temporal resolution (bucket granularity)
 * @returns Formatted bucket key string
 */
export function formatTemporalBucket(date: Date, resolution: TransformResolution): string {
    const pad2 = (value: number): string => String(value).padStart(2, '0');

    if (resolution === 'hour') {
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:00`;
    }
    if (resolution === 'day') {
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }
    if (resolution === 'weekday') {
        return String(date.getUTCDay());
    }
    if (resolution === 'monthday') {
        return pad2(date.getUTCDate());
    }
    if (resolution === 'month') {
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
    }
    return String(date.getUTCFullYear());
}

/**
 * Flattens all events from all rows into an array of event rows with bucket and value fields.
 *
 * Used internally by presetTemporal to prepare data for reduction.
 *
 * @param options Temporal preset options (rows, eventsOf, timestampOf, resolution, valueOf)
 * @returns Array of event rows with __bucket and __value fields
 */
const toTemporalRows = <T extends TransformRow, E>(
    options: TemporalPresetOptions<T, E>
): TransformRow[] => {
    const { rows, eventsOf, timestampOf, resolution, valueOf } = options;
    const eventRows: TransformRow[] = [];

    rows.forEach((row, rowIndex) => {
        const rowAutkIds = Array.isArray(row.autkIds) && row.autkIds.length > 0
            ? row.autkIds
            : [rowIndex];
        const events = eventsOf(row) ?? [];

        events.forEach((event) => {
            const timestamp = timestampOf(event);
            if (timestamp === null || timestamp === undefined) return;

            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            if (!date) return;
            if (!Number.isFinite(date.getTime())) return;

            eventRows.push({
                autkIds: rowAutkIds,
                __bucket: formatTemporalBucket(date, resolution),
                __value: valueOf ? (valueOf(event) ?? null) : 1,
            });
        });
    });

    return eventRows;
};
