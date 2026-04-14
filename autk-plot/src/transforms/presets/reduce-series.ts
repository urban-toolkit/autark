/**
 * Reduce-series transform preset.
 *
 * Flattens feature-level series arrays into individual points, groups them
 * by their exact timestamp (no time-resolution binning), and reduces each
 * group to a single value across features. Source feature provenance
 * (`autkIds`) is merged across all points that share the same timestamp.
 *
 * Accepts two element formats inside the series array:
 *   - Plain numbers: the array index is used as the bucket key.
 *   - Objects: `timestamp` and `value` sub-fields are read (configurable).
 *     Timestamps are normalised and parsed as dates; the raw normalised string
 *     is used as the bucket key so sort order is preserved.
 */

import { valueAtPath } from '../../types-core';

import type { AutkDatum } from '../../types-chart';
import type { ReduceSeriesTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runReduceSeries`.
 */
export type ExecutedReduceSeriesTransform = {
    preset: 'reduce-series';
    rows: ReduceSeriesBucketRow[];
};

/**
 * A single reduce-series bucket row ready for chart rendering.
 *
 * `bucket` is either the array index (plain-number series) or the normalised
 * timestamp string for object-based series.
 */
export type ReduceSeriesBucketRow = {
    bucket: string;
    value: number;
    count: number;
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a reduce-series transform and returns chart-ready rows.
 */
export function runReduceSeries(rows: AutkDatum[], config: ReduceSeriesTransformConfig, columns: string[]): ExecutedReduceSeriesTransform {
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
            // Plain number — use array index as bucket key.
            if (typeof point === 'number' && Number.isFinite(point)) {
                pointRows.push({ autkIds: rowAutkIds, __bucket: String(index), __value: point });
                return;
            }

            if (!point || typeof point !== 'object') return;

            // Object with timestamp + value fields.
            const raw = valueAtPath(point as Record<string, unknown>, timestampAttr);
            if (raw === null || raw === undefined) return;

            // Normalise space-separated ISO strings the same way binning-events does.
            const normalized = typeof raw === 'string' ? raw.replace(' ', 'T') : raw;
            const date = normalized instanceof Date ? normalized : new Date(normalized as string | number);
            if (!Number.isFinite(date.getTime())) return;

            // Use the normalised raw string as the bucket key (no resolution binning).
            const bucket = typeof normalized === 'string' ? normalized : String(raw);

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
        preset: 'reduce-series',
        rows: reduced.map(item => ({
            bucket: item.key,
            value: item.value,
            count: item.count,
            autkIds: item.autkIds,
        })),
    };
}
