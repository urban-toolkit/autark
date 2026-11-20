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

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { ReduceSeriesTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runReduceSeries`.
 */
export type ExecutedReduceSeriesTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'reduce-series';
    /** Reduced series rows ready for downstream plot rendering. */
    rows: ReduceSeriesBucketRow[];
};

/**
 * A single reduce-series bucket row ready for plot rendering.
 *
 * `bucket` is either the array index (plain-number series) or the normalised
 * timestamp string for object-based series.
 */
export type ReduceSeriesBucketRow = {
    /** Timestamp or index key identifying the reduced bucket. */
    bucket: string;
    /** Reduced numeric result for the bucket. */
    value: number;
    /** Number of source points collapsed into the bucket. */
    count: number;
    /** Merged source feature ids represented by the bucket. */
    autkIds: number[];
    /** The group (`options.by`) the row belongs to; absent when the transform is not grouped. */
    group?: string;
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a reduce-series transform and returns plot-ready rows.
 *
 * @param rows Input feature rows containing series arrays.
 * @param config Transform configuration controlling timestamp/value extraction and reduction.
 * @param columns Ordered source columns; `columns[0]` is the series attribute.
 * @returns Executed reduced-series transform payload.
 */
export function runReduceSeries(rows: AutkDatum[], config: ReduceSeriesTransformConfig, columns: string[]): ExecutedReduceSeriesTransform {
    const seriesAttr = columns[0] ?? '';
    const timestampAttr = config.options?.timestamp ?? 'timestamp';
    const valueAttr = config.options?.value ?? 'value';
    const reducer = config.options?.reducer ?? 'avg';
    const groupAttr = config.options?.by;

    /** Intermediate flattened series-point row consumed by `reduceBuckets()`. */
    type PointRow = { autkIds: number[]; __bucket: string; __value: number | null; __group: string };
    const pointRows: PointRow[] = [];

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) ? row.autkIds as number[] : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];
        const series = valueAtPath(row, seriesAttr);
        const group = groupAttr ? String(valueAtPath(row, groupAttr) ?? '') : '';
        if (!Array.isArray(series)) return;

        series.forEach((point: unknown, index: number) => {
            // Plain number — use array index as bucket key.
            if (typeof point === 'number' && Number.isFinite(point)) {
                pointRows.push({ autkIds: rowAutkIds, __bucket: String(index), __value: point, __group: group });
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

            pointRows.push({ autkIds: rowAutkIds, __bucket: bucket, __value: v, __group: group });
        });
    });

    const reduce = (rows: PointRow[]) => reduceBuckets({
        rows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: (row) => {
            const v = (row as PointRow).__value;
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    // Without `by` all features are one series; with it, each group is reduced on its own.
    const groups = new Map<string, PointRow[]>();
    for (const r of pointRows) {
        const g = groupAttr ? r.__group : '';
        const list = groups.get(g);
        if (list) list.push(r); else groups.set(g, [r]);
    }

    return {
        preset: 'reduce-series',
        rows: [...groups].flatMap(([group, rows]) => reduce(rows).map(item => ({
            bucket: item.key,
            value: item.value,
            count: item.count,
            autkIds: item.autkIds,
            ...(groupAttr ? { group } : {}),
        }))),
    };
}
