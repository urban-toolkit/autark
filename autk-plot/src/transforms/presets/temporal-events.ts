import {
    reduceBuckets,
    type ReducedBucket,
    type TransformReducerName,
    type TransformResolution,
    type TransformRow,
} from '../transform-engine';

export type TemporalBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

export type EventTemporalPresetOptions<T extends TransformRow, E> = {
    rows: T[];
    eventsOf: (row: T) => E[] | null | undefined;
    timestampOf: (event: E) => Date | string | number | null | undefined;
    resolution: TransformResolution;
    reducer?: TransformReducerName;
    valueOf?: (event: E) => number | null | undefined;
};

const toDate = (value: Date | string | number | null | undefined): Date | null => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Formats a date into one of the supported temporal bucket keys.
 */
export function formatTemporalBucket(date: Date, resolution: TransformResolution): string {
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
    options: EventTemporalPresetOptions<T, E>
): TransformRow[] => {
    const { rows, eventsOf, timestampOf, resolution, valueOf } = options;
    const eventRows: TransformRow[] = [];

    rows.forEach((row, rowIndex) => {
        const rowAutkIds = Array.isArray(row.autkIds) && row.autkIds.length > 0
            ? row.autkIds
            : [rowIndex];
        const events = eventsOf(row) ?? [];

        events.forEach((event) => {
            const date = toDate(timestampOf(event));
            if (!date) return;

            eventRows.push({
                autkIds: rowAutkIds,
                __bucket: formatTemporalBucket(date, resolution),
                __value: valueOf ? (valueOf(event) ?? null) : 1,
            });
        });
    });

    return eventRows;
};

const mapReducedToTemporalRows = (buckets: ReducedBucket[]): TemporalBucketRow[] => buckets.map(item => ({
    bucket: item.key,
    value: item.value,
    count: item.count,
    autkIds: item.autkIds,
}));

/**
 * Aggregates nested event collections into temporal buckets.
 */
export function presetEventsByResolution<T extends TransformRow, E>(
    options: EventTemporalPresetOptions<T, E>
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

    return mapReducedToTemporalRows(reduced);
}