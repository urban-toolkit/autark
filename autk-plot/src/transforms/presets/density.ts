/**
 * Density transform preset.
 *
 * Estimates the kernel density of a numeric column on a grid of points, one curve per group, with
 * the Epanechnikov kernel `K(u) = 3/4 · (1 − u²)` for `|u| < 1`: each row adds
 * `K((x − v) / h) / (n · h)` to the point at `x`, so each curve integrates to 1. A row reaches only
 * the points within one bandwidth `h` of its value, each with a real weight (`N:N`), and its share
 * of a set of points is the part of its kernel mass that falls in them.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { DensityTransformConfig } from '../../api';
import type { TransformDefinition } from '../registry';
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

/** Result produced by `runDensity`. */
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
 * @param options Transform options (`transform.options`): bandwidth and grid size.
 * @param columns `[value]` for one curve, or `[group, value]` for one curve per group.
 * @returns Rows of the `density` shape and their provenance, with the groups and the bandwidth.
 */
export function runDensity(rows: AutkDatum[], options: NonNullable<DensityTransformConfig['options']>, columns: string[]): Omit<ExecutedDensityTransform, 'preset'> {
    const [groupAttr, valueAttr] = columns.length >= 2 ? [columns[0], columns[1]] : [null, columns[0] ?? ''];
    const pointsPerCurve = Math.max(2, options.points ?? DEFAULT_POINTS);

    const samples = rows.flatMap((row, index) => {
        const value = Number(valueAtPath(row, valueAttr));
        if (!Number.isFinite(value)) return [];
        const ids = Array.isArray(row?.autkIds) && row.autkIds.length > 0 ? row.autkIds : [index];
        return [{ ids, group: groupAttr ? String(valueAtPath(row, groupAttr) ?? '') : '', value }];
    });

    const values = samples.map(s => s.value);
    const [lo, hi] = (d3.extent(values) as [number | undefined, number | undefined]).map(v => v ?? 0) as [number, number];
    const deviation = d3.deviation(values) ?? 0;
    const bandwidth = options.bandwidth
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

// ---- Definition ---------------------------------------------------------

/** Kernel density estimate of a numeric column, one curve per group: one row per grid point. */
export const density: TransformDefinition = {
    name: 'density',
    label: 'Kernel density',
    shape: 'density',
    run: runDensity,
};
