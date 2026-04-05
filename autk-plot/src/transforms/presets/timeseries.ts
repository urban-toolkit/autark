import {
    reduceBuckets,
    type ReducedBucket,
    type TransformReducerName,
    type TransformRow,
} from '../kernel';

export type TimeseriesBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

export type TimeseriesPoint = {
    timestamp: Date | string | number;
    value: number | null | undefined;
};

export type TimeseriesPresetOptions<T extends TransformRow> = {
    rows: T[];
    pointsOf: (row: T) => TimeseriesPoint[] | null | undefined;
    reducer?: TransformReducerName;
};

const mapReducedToTemporalRows = (buckets: ReducedBucket[]): TimeseriesBucketRow[] => buckets.map(item => ({
    bucket: item.key,
    value: item.value,
    count: item.count,
    autkIds: item.autkIds,
}));

/**
 * Aggregates feature timeseries by timestamp across all rows.
 */
export function presetTimeseriesAggregate<T extends TransformRow>(
    options: TimeseriesPresetOptions<T>
): TimeseriesBucketRow[] {
    const reducer = options.reducer ?? 'avg';
    const pointRows: TransformRow[] = [];

    options.rows.forEach((row, rowIndex) => {
        const rowAutkIds = Array.isArray(row.autkIds) && row.autkIds.length > 0
            ? row.autkIds
            : [rowIndex];
        const points = options.pointsOf(row) ?? [];

        points.forEach((point) => {
            pointRows.push({
                autkIds: rowAutkIds,
                __bucket: String(point.timestamp),
                __value: point.value,
            });
        });
    });

    const reduced = reduceBuckets({
        rows: pointRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: (row) => {
            const value = row.__value;
            return typeof value === 'number' && Number.isFinite(value) ? value : null;
        },
        reducer,
    });

    return mapReducedToTemporalRows(reduced);
}