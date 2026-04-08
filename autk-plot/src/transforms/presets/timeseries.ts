/**
 * Timeseries transform preset.
 *
 * Flattens feature-level timeseries arrays into individual points, buckets
 * them by timestamp, and reduces each bucket to a single value. Source feature
 * provenance (`autkIds`) is merged across all points that fall into a bucket.
 */

import { valueAtPath } from '../../core-types';

import type { AutkDatum, TimeseriesTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runTimeseries`.
 */
export type ExecutedTimeseriesTransform = {
    preset: 'timeseries';
    rows: TimeseriesBucketRow[];
};

/**
 * A single timeseries bucket row ready for chart rendering.
 *
 * `bucket` is the string representation of the timestamp for that bucket.
 */
export type TimeseriesBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a timeseries transform and returns chart-ready rows.
 */
export function runTimeseries(rows: AutkDatum[], config: TimeseriesTransformConfig, columns: string[]): ExecutedTimeseriesTransform {
    const seriesAttr = columns[0] ?? '';
    const timestampAttr = config.options?.timestamp ?? 'timestamp';
    const valueAttr = config.options?.value ?? 'value';
    const reducer = config.options?.reducer ?? 'avg';

    type PointRow = { autkIds: number[]; __bucket: string; __value: number | null };
    const pointRows: PointRow[] = [];

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) ? row.autkIds as number[] : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];
        const series = valueAtPath(row, seriesAttr);
        if (!Array.isArray(series)) return;

        series.forEach((point: unknown, index: number) => {
            if (typeof point === 'number' && Number.isFinite(point)) {
                pointRows.push({ autkIds: rowAutkIds, __bucket: String(index), __value: point });
                return;
            }
            if (!point || typeof point !== 'object') return;

            const raw = valueAtPath(point as Record<string, unknown>, timestampAttr) ?? index;
            const bucket = raw instanceof Date || typeof raw === 'string' || typeof raw === 'number'
                ? String(raw)
                : String(index);

            const v = Number(valueAtPath(point as Record<string, unknown>, valueAttr));
            if (!Number.isFinite(v)) return;

            pointRows.push({ autkIds: rowAutkIds, __bucket: bucket, __value: v });
        });
    });

    const reduced = reduceBuckets({
        rows: pointRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: (row) => {
            const v = (row as PointRow).__value;
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'timeseries',
        rows: reduced.map(item => ({
            bucket: item.key,
            value: item.value,
            count: item.count,
            autkIds: item.autkIds,
        })),
    };
}
