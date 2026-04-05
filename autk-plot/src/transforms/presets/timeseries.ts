import { valueAtPath } from '../../core-types';

import type { AutkDatum, TimeseriesTransformConfig } from '../../api';
import type { TransformRow, TransformReducerName } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

export type ExecutedTimeseriesTransform = {
    preset: 'timeseries';
    attributes: ['bucket', 'value'];
    rows: TimeseriesBucketRow[];
};

/**
 * Runs a timeseries transform and returns chart-ready rows.
 */
export function runTimeseries(rows: AutkDatum[], config: TimeseriesTransformConfig): ExecutedTimeseriesTransform {
    return {
        preset: 'timeseries',
        attributes: ['bucket', 'value'],
        rows: presetTimeseries({
            rows,
            reducer: config.options?.reducer ?? 'avg',
            pointsOf: (row) => getTimeseriesPoints(row, config),
        }),
    };
}

// ---- Preset algorithm ---------------------------------------------------

export type TimeseriesPresetOptions<T extends TransformRow> = {
    rows: T[];
    pointsOf: (row: T) => TimeseriesPoint[] | null | undefined;
    reducer?: TransformReducerName;
}

export type TimeseriesBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

/**
 * Aggregates feature timeseries by timestamp across all rows.
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

export type TimeseriesPoint = {
    timestamp: Date | string | number;
    value: number | null | undefined;
};

function getTimeseriesPoints(
    row: TransformRow,
    config: TimeseriesTransformConfig
): TimeseriesPoint[] {
    const sourceSeries = valueAtPath(row, config.attributes.series);
    if (!Array.isArray(sourceSeries)) {
        return [];
    }

    const points: TimeseriesPoint[] = [];

    sourceSeries.forEach((point, index) => {
        if (typeof point === 'number' && Number.isFinite(point)) {
            points.push({
                timestamp: index,
                value: point,
            });
            return;
        }

        if (!point || typeof point !== 'object') {
            return;
        }

        const timestamp = valueAtPath(point as Record<string, unknown>, config.attributes.timestamp) ?? index;
        const rawValue = valueAtPath(point as Record<string, unknown>, config.attributes.value);
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
            return;
        }

        points.push({
            timestamp: timestamp instanceof Date || typeof timestamp === 'string' || typeof timestamp === 'number'
                ? timestamp
                : index,
            value: numericValue,
        });
    });

    return points;
}