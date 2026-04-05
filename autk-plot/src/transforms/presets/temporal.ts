import { valueAtPath } from '../../core-types';

import type { AutkDatum, TemporalTransformConfig } from '../../api';
import type { TransformRow, TransformReducerName, TransformResolution } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

export type ExecutedTemporalTransform = {
    preset: 'temporal';
    attributes: ['bucket', 'value'];
    rows: TemporalBucketRow[];
};

/**
 * Runs a temporal transform and returns chart-ready rows.
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

export type TemporalPresetOptions<T extends TransformRow, E> = {
    rows: T[];
    eventsOf: (row: T) => E[] | null | undefined;
    timestampOf: (event: E) => Date | string | number | null | undefined;
    resolution: TransformResolution;
    reducer?: TransformReducerName;
    valueOf?: (event: E) => number | null | undefined;
};

export type TemporalBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

/**
 * Aggregates nested event collections into temporal buckets.
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
 * Formats a date into one of the supported temporal bucket keys.
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
