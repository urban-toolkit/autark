/**
 * Density transform preset (kernel density estimate).
 *
 * Spreads every row over a grid of points along a numeric column with an
 * Epanechnikov kernel, `K(u) = 3/4 · (1 − u²)` for `|u| < 1`. Each row adds
 * `K((x − v) / h) / (n · h)` to the point at `x`, so each group's curve
 * integrates to 1. The kernel has finite support: a row only reaches the
 * points within one bandwidth `h` of its value.
 *
 * This is fractional coverage: a row contributes a real weight to several
 * points (`N:N`, weights in ℝ≥0), and its share of a set of points is the part
 * of its kernel mass that falls in them.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { DensityTransformConfig } from '../../api';
import type { ProvenanceContribution, ProvenancePair, TransformProvenance } from '../../types-provenance';

import { featureId } from '../../provenance/model';

/** Grid points per curve by default. */
const DEFAULT_POINTS = 48;
/**
 * Scale from the normal reference bandwidth (Silverman's rule) to the
 * Epanechnikov kernel, whose support is `±h`: `√5 ≈ 2.24`.
 */
const EPANECHNIKOV_SCALE = Math.sqrt(5);

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runDensity`.
 */
export type ExecutedDensityTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'density';
    /** Grid points of every group's curve, by group, then position. */
    rows: DensityPointRow[];
    /** Groups, in curve order; `['']` without a group column. */
    groups: string[];
    /** Bandwidth `h` of the kernel. */
    bandwidth: number;
    /** Provenance `D0 features → D1 density points`, with real weights, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** One grid point of one group's density curve. */
export type DensityPointRow = {
    /** Group of the curve, `''` without a group column. */
    group: string;
    /** Position of the point in its curve. */
    index: number;
    /** Value of the numeric column at the point. */
    x: number;
    /** Readable label: the group and the value. */
    label: string;
    /** Estimated density at the point. */
    value: number;
    /** Features whose kernel reaches the point, used for selection linking. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a kernel density estimate and returns the grid points of every curve.
 *
 * @param rows Input feature rows.
 * @param config Transform configuration: bandwidth and grid size.
 * @param columns `[value]` for one curve, or `[group, value]` for one curve per group.
 * @returns Grid points with their densities and the kernel provenance.
 */
export function runDensity(rows: AutkDatum[], config: DensityTransformConfig, columns: string[]): ExecutedDensityTransform {
    const [groupAttr, valueAttr] = columns.length >= 2 ? [columns[0], columns[1]] : [null, columns[0] ?? ''];
    const pointsPerCurve = Math.max(2, config.options?.points ?? DEFAULT_POINTS);

    const samples = rows.flatMap((row, index) => {
        const value = Number(valueAtPath(row, valueAttr));
        if (!Number.isFinite(value)) return [];
        const ids = Array.isArray(row?.autkIds) && row.autkIds.length > 0 ? row.autkIds : [index];
        return [{ ids, group: groupAttr ? String(valueAtPath(row, groupAttr) ?? '') : '', value }];
    });

    const values = samples.map(s => s.value);
    const [lo, hi] = (d3.extent(values) as [number | undefined, number | undefined]).map(v => v ?? 0) as [number, number];
    const deviation = d3.deviation(values) ?? 0;
    const bandwidth = config.options?.bandwidth
        ?? (deviation > 0 ? EPANECHNIKOV_SCALE * 1.06 * deviation * values.length ** -0.2 : (hi - lo) / 10 || 1);

    // The grid reaches one bandwidth past the data, where every curve is back at zero.
    const xs = d3.range(pointsPerCurve).map(k => lo - bandwidth + (k * (hi - lo + 2 * bandwidth)) / (pointsPerCurve - 1));
    const groups = Array.from(new Set(samples.map(s => s.group))).sort((a, b) => a.localeCompare(b));
    const format = d3.format('~s');

    const outputRows: DensityPointRow[] = [];
    const rowIds: string[] = [];
    const pairs: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];

    for (const group of groups) {
        const members = samples.filter(s => s.group === group);
        const scale = 1 / (members.length * bandwidth);
        xs.forEach((x, index) => {
            const id = `density:${JSON.stringify([group, index])}`;
            let density = 0;
            const reached = new Set<number>();
            for (const member of members) {
                const u = (x - member.value) / bandwidth;
                if (Math.abs(u) >= 1) continue;
                const weight = 0.75 * (1 - u * u) * scale;
                density += weight;
                for (const feature of member.ids) {
                    reached.add(feature);
                    pairs.push({ source: featureId(feature), target: id, weight });
                    contributions.push({ source: featureId(feature), target: id, value: weight, weight });
                }
            }
            outputRows.push({
                group,
                index,
                x,
                label: group ? `${group} · ${format(x)}` : format(x),
                value: density,
                autkIds: Array.from(reached),
            });
            rowIds.push(id);
        });
    }

    return {
        preset: 'density',
        rows: outputRows,
        groups,
        bandwidth,
        provenance: {
            stages: [{ name: 'D1', label: 'density points', ids: rowIds }],
            relations: [{ source: 'D0', target: 'D1', pairs }],
            rowIds,
            contributions,
            reducer: 'sum',
        },
    };
}
