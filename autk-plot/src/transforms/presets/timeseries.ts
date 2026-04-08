/**
 * Timeseries transform preset.
 *
 * Flattens feature-level timeseries arrays into individual points, buckets
 * them by timestamp, and reduces each bucket to a single value. Source feature
 * provenance (`autkIds`) is merged across all points that fall into a bucket.
 */

import { valueAtPath } from '../../core-types';

import type { AutkDatum, TimeseriesTransformConfig } from '../../api';
import type { TransformRow, TransformReducerName } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runTimeseries`.
 *
 * Carries the fixed attribute tuple `['bucket', 'value']` and the bucketed
 * rows ready for line-chart rendering.
 */
export type ExecutedTimeseriesTransform = {
    preset: 'timeseries';
    rows: TimeseriesBucketRow[];
};

/**
 * Runs a timeseries transform and returns chart-ready rows.
 *
 * Aggregates feature-level timeseries into buckets by timestamp, applying the specified reducer.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Timeseries transform configuration
 * @returns Executed timeseries transform result
 */
export function runTimeseries(rows: AutkDatum[], config: TimeseriesTransformConfig, columns: string[]): ExecutedTimeseriesTransform {
    const seriesAttr = columns[0] ?? '';
    return {
        preset: 'timeseries',
        rows: presetTimeseries({
            rows,
            reducer: config.options?.reducer ?? 'avg',
            pointsOf: (row) => getTimeseriesPoints(row, seriesAttr, config),
        }),
    };
}

// ---- Preset algorithm ---------------------------------------------------

/**
 * Options accepted by `presetTimeseries`.
 *
 * @template T Row type extending `TransformRow`.
 */
export type TimeseriesPresetOptions<T extends TransformRow> = {
    /** Input feature rows. */
    rows: T[];
    /** Extracts the timeseries point array from a row. */
    pointsOf: (row: T) => TimeseriesPoint[] | null | undefined;
    /** Reducer applied within each timestamp bucket. Defaults to `'avg'`. */
    reducer?: TransformReducerName;
}

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

/**
 * Aggregates feature timeseries by timestamp across all rows.
 *
 * Flattens all timeseries points, then reduces by timestamp bucket.
 *
 * @param options Timeseries preset options (rows, pointsOf, reducer)
 * @returns Array of reduced timeseries buckets
 */
export function presetTimeseries<T extends TransformRow>(
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

    return reduced.map(item => ({
        bucket: item.key,
        value: item.value,
        count: item.count,
        autkIds: item.autkIds,
    }));
}

/**
 * A single point in a feature timeseries before aggregation.
 */
export type TimeseriesPoint = {
    timestamp: Date | string | number;
    value: number | null | undefined;
};

/**
 * Extracts timeseries points from a row according to the timeseries transform config.
 *
 * Handles both array-of-numbers and array-of-objects formats, extracting timestamp and value fields.
 *
 * @param row Input row (feature)
 * @param config Timeseries transform configuration
 * @returns Array of timeseries points with timestamp and value
 */
function getTimeseriesPoints(
    row: TransformRow,
    seriesAttr: string,
    config: TimeseriesTransformConfig
): TimeseriesPoint[] {
    const sourceSeries = valueAtPath(row, seriesAttr);
    if (!Array.isArray(sourceSeries)) {
        return [];
    }

    const timestampAttr = config.options?.timestamp ?? 'timestamp';
    const valueAttr = config.options?.value ?? 'value';
    const points: TimeseriesPoint[] = [];

    sourceSeries.forEach((point, index) => {
        if (typeof point === 'number' && Number.isFinite(point)) {
            points.push({ timestamp: index, value: point });
            return;
        }

        if (!point || typeof point !== 'object') return;

        const timestamp = valueAtPath(point as Record<string, unknown>, timestampAttr) ?? index;
        const rawValue = valueAtPath(point as Record<string, unknown>, valueAttr);
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) return;

        points.push({
            timestamp: timestamp instanceof Date || typeof timestamp === 'string' || typeof timestamp === 'number'
                ? timestamp
                : index,
            value: numericValue,
        });
    });

    return points;
}