/**
 * Binning-events transform preset.
 *
 * Flattens nested event arrays from feature properties, buckets them by
 * timestamp at a configurable resolution, and reduces each bucket to a single
 * value. Source feature provenance (`autkIds`) is merged across all events
 * that fall into a bucket.
 */

import { valueAtPath } from '../../types-core';

import type { AutkDatum } from '../../types-chart';
import type { BinningEventsTransformConfig, TransformResolution } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinningEvents`.
 */
export type ExecutedBinningEventsTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'binning-events';
    /** Event bucket rows ready for downstream chart rendering. */
    rows: BinningEventsBucketRow[];
};

/**
 * A single event bucket row ready for chart rendering.
 *
 * `bucket` is a formatted string key (e.g. `"2024-03"` for monthly resolution).
 */
export type BinningEventsBucketRow = {
    /** Formatted bucket identifier (for example `"2024-03"`). */
    bucket: string;
    /** Reduced numeric result for the bucket. */
    value: number;
    /** Number of source event rows collapsed into the bucket. */
    count: number;
    /** Merged source feature ids represented by the bucket. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a binning-events transform and returns chart-ready rows.
 *
 * @param rows Input feature rows containing nested event arrays.
 * @param config Transform configuration controlling timestamp parsing and reduction.
 * @param columns Ordered source columns; `columns[0]` is the event-array attribute.
 * @returns Executed event-binning transform payload.
 */
export function runBinningEvents(rows: AutkDatum[], config: BinningEventsTransformConfig, columns: string[]): ExecutedBinningEventsTransform {
    const eventsAttr = columns[0] ?? '';
    const timestampAttr = config.options?.timestamp ?? 'timestamp';
    const valueAttr = config.options?.value ?? 'value';
    const resolution = config.options?.resolution ?? 'month';
    const reducer = config.options?.reducer ?? 'count';

    /** Intermediate flattened event row consumed by `reduceBuckets()`. */
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
                __bucket: formatEventBucket(date, resolution),
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
        preset: 'binning-events',
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
 * Formats a date into a string bucket key according to the specified resolution.
 *
 * @param date UTC date to encode into a bucket key.
 * @param resolution Temporal resolution used to derive the key.
 * @returns Bucket label consumed by downstream chart rendering.
 */
function formatEventBucket(date: Date, resolution: TransformResolution): string {
    /** Left-pads a numeric component to two digits. */
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
