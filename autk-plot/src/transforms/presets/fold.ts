/**
 * Fold transform preset.
 *
 * Unfolds every row into one unit per numeric measure (`1:N`) and reduces the
 * units per category and measure (`N:1`): e.g. the average area, perimeter,
 * and number of events of the regions of each land use. Measures are rescaled
 * to `[0, 1]` by default so they share one axis, as in a radar chart.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { FoldTransformConfig } from '../../api';
import type { ProvenanceId, TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import type { Row } from '../kernel';
import { unnestedProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runFold`.
 */
export type ExecutedFoldTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'fold';
    /** One cell per category and measure, by category then measure. */
    rows: FoldCellRow[];
    /** Measure names, in axis order. */
    measures: string[];
    /** Raw extent of each measure, used to rescale it. */
    extents: [number, number][];
    /** Provenance `D0 features → D1 units → D2 cells`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** One category and one measure. */
export type FoldCellRow = {
    /** Category label. */
    category: string;
    /** Measure name. */
    measure: string;
    /** Measure position, `0` for `axis[1]`. */
    measureIndex: number;
    /** Readable label, `"<category> · <measure>"`. */
    label: string;
    /** Reduced value of the measure over the category's rows (rescaled when normalized). */
    value: number;
    /** How many rows of the category have a finite value for the measure. */
    count: number;
    /** Merged source feature ids of the cell, used for selection linking. */
    autkIds: number[];
};

/** Unit row: one feature and one measure. */
type FoldUnit = Row & { autkIds: number[]; __key: string; __value: number };

// ---- Runner -------------------------------------------------------------

/**
 * Runs a fold transform and returns one cell per category and measure.
 *
 * @param rows Input feature rows.
 * @param config Transform configuration: reducer and normalization.
 * @param columns `columns[0]` is the category; `columns[1…]` are numeric measures.
 * @returns Cells by category, then measure.
 * @throws If no measure column is given.
 */
export function runFold(rows: AutkDatum[], config: FoldTransformConfig, columns: string[]): ExecutedFoldTransform {
    if (columns.length < 2) {
        throw new Error('fold: a category column and at least one measure are required.');
    }
    const reducer = config.options?.reducer ?? 'avg';
    const normalize = config.options?.normalize ?? true;
    const [categoryAttr, ...measures] = columns;

    const extents = measures.map(measure => {
        const values = rows.map(row => Number(valueAtPath(row, measure))).filter(Number.isFinite);
        const [lo, hi] = d3.extent(values) as [number | undefined, number | undefined];
        return [lo ?? 0, hi ?? 1] as [number, number];
    });
    const scaled = (value: number, m: number) => {
        if (!normalize) return value;
        const [lo, hi] = extents[m];
        return hi > lo ? (value - lo) / (hi - lo) : 0;
    };

    const units: FoldUnit[] = [];
    const unitIds: ProvenanceId[] = [];
    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) && row.autkIds.length > 0 ? row.autkIds : [rowIndex];
        const category = String(valueAtPath(row, categoryAttr) ?? '');
        measures.forEach((measure, m) => {
            const value = Number(valueAtPath(row, measure));
            if (!Number.isFinite(value)) return;
            units.push({ autkIds: ids, __key: JSON.stringify([category, m]), __value: scaled(value, m) });
            unitIds.push(`unit:${ids.join('+')}.${m}`);
        });
    });

    const buckets = collectBuckets({
        rows: units,
        bucketOf: (unit) => String(unit.__key),
        valueOf: reducer === 'count' ? undefined : (unit) => (unit as FoldUnit).__value,
        reducer,
    });
    const cellOf = (key: string) => JSON.parse(key) as [string, number];
    buckets.sort((a, b) => {
        const [ca, ma] = cellOf(a.key);
        const [cb, mb] = cellOf(b.key);
        return ca.localeCompare(cb) || ma - mb;
    });

    return {
        preset: 'fold',
        measures,
        extents,
        rows: buckets.map(bucket => {
            const [category, m] = cellOf(bucket.key);
            return {
                category,
                measure: measures[m],
                measureIndex: m,
                label: `${category} · ${measures[m]}`,
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        }),
        provenance: unnestedProvenance({
            units,
            unitIds,
            unitLabel: 'measures',
            buckets,
            bucketLabel: 'cells',
            rowKeys: buckets.map(bucket => bucket.key),
            reducer,
            // Each feature has one unit per measure: shares are computed per measure.
            groupOf: (key) => `measure:${cellOf(key)[1]}`,
        }),
    };
}
