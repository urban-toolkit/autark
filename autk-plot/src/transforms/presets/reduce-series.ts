/**
 * Reduce-series transform preset.
 *
 * Flattens the series arrays nested in each row into points, groups them by their exact timestamp
 * (no resolution binning), and reduces each group to a single value across features, merging the
 * source features (`autkIds`) of its points. A plain number is keyed by its array index; an object
 * gives its `timestamp` and `value` fields (configurable), and its normalized timestamp string is
 * the bucket key, so sort order is preserved.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { ReduceSeriesTransformConfig } from '../../api';
import type { TransformDefinition } from '../registry';
import type { ProvenanceId, TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { unnestedProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/** Result produced by `runReduceSeries`. */
export type ExecutedReduceSeriesTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'reduce-series';
    /** Reduced series rows ready for downstream plot rendering. */
    rows: ReduceSeriesBucketRow[];
    /** Provenance `D0 features → D1 series points → D2 buckets`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A single reduce-series bucket row ready for plot rendering. */
export type ReduceSeriesBucketRow = {
    /** Timestamp or index key identifying the reduced bucket. */
    bucket: string;
    /** Reduced numeric result for the bucket. */
    value: number;
    /** Number of source points collapsed into the bucket. */
    count: number;
    /** Merged source feature ids represented by the bucket. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a reduce-series transform and returns plot-ready rows.
 *
 * @param rows Input feature rows containing series arrays.
 * @param options Transform options (`transform.options`): timestamp and value fields, and reducer.
 * @param columns Ordered source columns; `columns[0]` is the series attribute.
 * @returns Rows of the `series` shape and their provenance.
 */
export function runReduceSeries(rows: AutkDatum[], options: NonNullable<ReduceSeriesTransformConfig['options']>, columns: string[]): Omit<ExecutedReduceSeriesTransform, 'preset'> {
    const seriesAttr = columns[0] ?? '';
    const timestampAttr = options.timestamp ?? 'timestamp';
    const valueAttr = options.value ?? 'value';
    const reducer = options.reducer ?? 'avg';

    /** Flattened series point, reduced by `collectBuckets`. */
    type PointRow = { autkIds: number[]; __bucket: string; __value: number | null };
    const pointRows: PointRow[] = [];
    /** Provenance id of each point row, `point:<feature>.<position in its series>`. */
    const pointIds: ProvenanceId[] = [];
    const pushPoint = (point: PointRow, index: number) => {
        pointRows.push(point);
        pointIds.push(`point:${point.autkIds.join('+')}.${index}`);
    };

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) ? row.autkIds as number[] : [];
        const rowAutkIds = ids.length > 0 ? ids : [rowIndex];
        const series = valueAtPath(row, seriesAttr);
        if (!Array.isArray(series)) return;

        series.forEach((point: unknown, index: number) => {
            // Plain number — use array index as bucket key.
            if (typeof point === 'number' && Number.isFinite(point)) {
                pushPoint({ autkIds: rowAutkIds, __bucket: String(index), __value: point }, index);
                return;
            }

            if (!point || typeof point !== 'object') return;

            // Object with timestamp + value fields.
            const raw = valueAtPath(point as Record<string, unknown>, timestampAttr);
            if (raw === null || raw === undefined) return;

            // Normalize space-separated ISO strings the same way binning-events does.
            const normalized = typeof raw === 'string' ? raw.replace(' ', 'T') : raw;
            const date = normalized instanceof Date ? normalized : new Date(normalized as string | number);
            if (!Number.isFinite(date.getTime())) return;

            // The normalized string is the bucket key (no resolution binning).
            const bucket = typeof normalized === 'string' ? normalized : String(raw);

            const v = Number(valueAtPath(point as Record<string, unknown>, valueAttr));
            if (!Number.isFinite(v)) return;

            pushPoint({ autkIds: rowAutkIds, __bucket: bucket, __value: v }, index);
        });
    });

    const reduced = collectBuckets({
        rows: pointRows,
        bucketOf: (row) => String(row.__bucket ?? ''),
        valueOf: (row) => {
            const v = (row as PointRow).__value;
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        provenance: unnestedProvenance({
            units: pointRows,
            unitIds: pointIds,
            unitLabel: 'series points',
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

// ---- Definition ---------------------------------------------------------

/** The series nested in each row, reduced at each timestamp: one row per timestamp. */
export const reduceSeries: TransformDefinition = {
    name: 'reduce-series',
    label: 'Series reduced by time',
    shape: 'series',
    run: runReduceSeries,
};
