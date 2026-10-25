/**
 * Box-stats transform preset.
 *
 * Groups rows by a categorical column and summarizes a numeric column per
 * group with quartiles, Tukey whiskers, and outliers. Besides `autkIds`, each
 * summary records which source features are its median and its outliers, since
 * order statistics are produced by specific features rather than by all of them.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { BoxStatsTransformConfig } from '../../api';
import type { TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { binnedProvenance, indexedBins } from '../provenance';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBoxStats`.
 */
export type ExecutedBoxStatsTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'box-stats';
    /** One box summary per category, in first-seen order. */
    rows: BoxStatsRow[];
    /** Provenance `D0 features → D1 groups → D2 box summaries`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/**
 * A single box summary ready for plot rendering.
 */
export type BoxStatsRow = {
    /** Category of the box. */
    category: string;
    /** Number of rows with a finite value in the category. */
    count: number;
    /** First quartile. */
    q1: number;
    /** Median. */
    median: number;
    /** Third quartile. */
    q3: number;
    /** Lowest value within `q1 - whisker × IQR`. */
    whiskerLow: number;
    /** Highest value within `q3 + whisker × IQR`. */
    whiskerHigh: number;
    /** Values outside the whiskers. */
    outliers: number[];
    /** Source feature ids whose value is the median (one or the two middle values). */
    medianIds: number[];
    /** Source feature ids of the outliers. */
    outlierIds: number[];
    /** Merged source feature ids of the category, used for selection linking. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a box-stats transform and returns plot-ready box summaries.
 *
 * @param rows Input feature rows.
 * @param config Transform configuration with the whisker multiplier.
 * @param columns `columns[0]` is the category column, `columns[1]` the numeric column.
 * @returns Executed box-stats transform payload.
 */
export function runBoxStats(rows: AutkDatum[], config: BoxStatsTransformConfig, columns: string[]): ExecutedBoxStatsTransform {
    const categoryAttr = columns[0] ?? '';
    const valueAttr = columns[1] ?? '';
    const whisker = config.options?.whisker ?? 1.5;

    const reduced = collectBuckets({
        rows,
        bucketOf: (row) => String(valueAtPath(row, categoryAttr) ?? ''),
        valueOf: (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer: 'count',
    });

    const boxRows: BoxStatsRow[] = reduced.map(bucket => {
        const sourceOf = (row: number) => rows[row]?.autkIds?.[0] ?? row;
        const members = [...bucket.members].sort((a, b) => a.value - b.value);
        const values = members.map(member => member.value);

        const q1 = d3.quantileSorted(values, 0.25) ?? values[0];
        const median = d3.quantileSorted(values, 0.5) ?? values[0];
        const q3 = d3.quantileSorted(values, 0.75) ?? values[0];
        const iqr = q3 - q1;
        const inside = members.filter(m => m.value >= q1 - whisker * iqr && m.value <= q3 + whisker * iqr);
        const outside = members.filter(m => !inside.includes(m));

        const middle = members.length % 2 === 1
            ? [members[(members.length - 1) / 2]]
            : members.slice(members.length / 2 - 1, members.length / 2 + 1);

        return {
            category: bucket.key,
            count: bucket.count,
            q1,
            median,
            q3,
            whiskerLow: inside[0]?.value ?? q1,
            whiskerHigh: inside[inside.length - 1]?.value ?? q3,
            outliers: outside.map(m => m.value),
            medianIds: middle.map(m => sourceOf(m.row)),
            outlierIds: outside.map(m => sourceOf(m.row)),
            autkIds: bucket.autkIds,
        };
    });

    const keys = reduced.map(bucket => bucket.key);
    return {
        preset: 'box-stats',
        rows: boxRows,
        provenance: binnedProvenance({
            rows,
            buckets: reduced,
            bins: indexedBins(keys, keys, 'group'),
            binLabel: 'groups',
            aggregateLabel: 'box summaries',
            rowKeys: keys,
            reducer: 'count',
        }),
    };
}
