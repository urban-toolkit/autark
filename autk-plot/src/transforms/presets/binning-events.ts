/**
 * Binning-events transform preset.
 *
 * Flattens the event arrays nested in each row, buckets the events by timestamp at a configurable
 * resolution, and reduces each bucket to a single value. The source features (`autkIds`) of all
 * events in a bucket are merged.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { BinningEventsTransformConfig, TransformResolution } from '../../api';
import type { TransformDefinition } from '../registry';
import type { ProvenanceId, TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { unnestedProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/** Result produced by `runBinningEvents`. */
export type ExecutedBinningEventsTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'binning-events';
    /** Event bucket rows ready for downstream plot rendering. */
    rows: BinningEventsBucketRow[];
    /** Provenance `D0 features → D1 events → D2 buckets`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A single event bucket row ready for plot rendering. */
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
 * Runs a binning-events transform and returns plot-ready rows.
 *
 * @param rows Input feature rows containing nested event arrays.
 * @param options Transform options (`transform.options`) controlling timestamp parsing and reduction.
 * @param columns Ordered source columns; `columns[0]` is the event-array attribute.
 * @returns Rows of the `series` shape and their provenance.
 */
export function runBinningEvents(rows: AutkDatum[], options: NonNullable<BinningEventsTransformConfig['options']>, columns: string[]): Omit<ExecutedBinningEventsTransform, 'preset'> {
    const eventsAttr = columns[0] ?? '';
    const timestampAttr = options.timestamp ?? 'timestamp';
    const valueAttr = options.value ?? 'value';
    const resolution = options.resolution ?? 'month';
    const reducer = options.reducer ?? 'count';

    /** Flattened event, reduced by `collectBuckets`. */
    type EventRow = { autkIds: number[]; __bucket: string; __value: number | null };
    const eventRows: EventRow[] = [];
    /** Provenance id of each event row, `event:<feature>.<position in its array>`. */
    const eventIds: ProvenanceId[] = [];

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) ? row.autkIds as number[] : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];
        const events = valueAtPath(row, eventsAttr);
        if (!Array.isArray(events)) return;

        events.forEach((event: unknown, eventIndex: number) => {
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
            eventIds.push(`event:${rowAutkIds.join('+')}.${eventIndex}`);
        });
    });

    const reduced = collectBuckets({
        rows: eventRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const v = (row as EventRow).__value;
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        provenance: unnestedProvenance({
            units: eventRows,
            unitIds: eventIds,
            unitLabel: 'events',
            buckets: reduced,
            rowKeys: reduced.map(item => item.key),
            reducer,
        }),
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
 * @returns Bucket key, e.g. `"2024-03"` for monthly resolution.
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

// ---- Definition ---------------------------------------------------------

/** The events nested in each row, bucketed by time: one row per time bucket. */
export const binningEvents: TransformDefinition = {
    name: 'binning-events',
    label: 'Events over time',
    shape: 'series',
    run: runBinningEvents,
};
