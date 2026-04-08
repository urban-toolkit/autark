/**
 * Temporal transform preset.
 *
 * Flattens nested event arrays from feature properties, buckets them by
 * timestamp at a configurable resolution, and reduces each bucket to a single
 * value. Source feature provenance (`autkIds`) is merged across all events
 * that fall into a bucket.
 */

import { valueAtPath } from '../../core-types';

import type { AutkDatum, TemporalTransformConfig, TransformResolution } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runTemporal`.
 */
export type ExecutedTemporalTransform = {
    preset: 'temporal';
    rows: TemporalBucketRow[];
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

// ---- Runner -------------------------------------------------------------

/**
 * Runs a temporal transform and returns chart-ready rows.
 */
export function runTemporal(rows: AutkDatum[], config: TemporalTransformConfig, columns: string[]): ExecutedTemporalTransform {
    const eventsAttr = columns[0] ?? '';
    const timestampAttr = config.options?.timestamp ?? 'timestamp';
    const valueAttr = config.options?.value ?? 'value';
    const resolution = config.options?.resolution ?? 'month';
    const reducer = config.options?.reducer ?? 'count';

    type EventRow = { autkIds: number[]; __bucket: string; __value: number | null };
    const eventRows: EventRow[] = [];

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) ? row.autkIds as number[] : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];
        const events = valueAtPath(row, eventsAttr);
        if (!Array.isArray(events)) return;

        events.forEach((event: unknown) => {
            if (!event || typeof event !== 'object') return;
            const raw = valueAtPath(event as Record<string, unknown>, timestampAttr);
            if (raw === null || raw === undefined) return;
            const normalized = typeof raw === 'string' ? raw.replace(' ', 'T') : raw;
            const date = normalized instanceof Date ? normalized : new Date(normalized as string | number);
            if (!Number.isFinite(date.getTime())) return;

            let value: number | null = null;
            if (reducer !== 'count') {
                const v = Number(valueAtPath(event as Record<string, unknown>, valueAttr));
                value = Number.isFinite(v) ? v : null;
            }

            eventRows.push({
                autkIds: rowAutkIds,
                __bucket: formatTemporalBucket(date, resolution),
                __value: value,
            });
        });
    });

    const reduced = reduceBuckets({
        rows: eventRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const v = (row as EventRow).__value;
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'temporal',
        rows: reduced.map(item => ({
            bucket: item.key,
            value: item.value,
            count: item.count,
            autkIds: item.autkIds,
        })),
    };
}

// ---- Bucket key formatter -----------------------------------------------

/**
 * Formats a date into a string bucket key according to the specified temporal resolution.
 */
function formatTemporalBucket(date: Date, resolution: TransformResolution): string {
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
