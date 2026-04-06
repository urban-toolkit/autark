/**
 * Heat matrix transform preset.
 *
 * Groups feature rows by a pair of dimensions (x, y) and reduces a numeric value
 * column within each cell. Each axis is handled independently: categorical attributes
 * are grouped by their string value; quantitative attributes are binned into
 * fixed-width ranges using the same bin-boundary format as `binning-1d`.
 *
 * Source feature provenance (`autkIds`) is merged across all rows that fall into
 * the same cell.
 */

import * as d3 from 'd3';

import { valueAtPath } from '../../core-types';

import type { AutkDatum, HeatmatrixTransformConfig } from '../../api';
import type { TransformRow } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runHeatmatrix`.
 *
 * Carries the fixed attribute tuple `['x', 'y', 'value']` and the aggregated
 * cell rows ready for heat matrix rendering.
 */
export type ExecutedHeatmatrixTransform = {
    preset: 'heatmatrix';
    attributes: ['x', 'y', 'value'];
    rows: HeatmatrixCellRow[];
};

/**
 * A single aggregated cell ready for chart rendering.
 *
 * `x` and `y` are the bin labels for this cell — either a category string or a
 * formatted numeric range such as `"1k-2k"`.
 */
export type HeatmatrixCellRow = {
    x: string;
    y: string;
    value: number;
    count: number;
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a heat matrix transform and returns chart-ready cell rows.
 *
 * Detects whether each axis attribute is categorical or quantitative, builds a
 * bin-label mapper for each axis, then groups rows by the resulting (x, y) label
 * pair and reduces the value column using the specified reducer.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Heat matrix transform configuration
 * @returns Executed heat matrix transform result
 */
export function runHeatmatrix(rows: AutkDatum[], config: HeatmatrixTransformConfig): ExecutedHeatmatrixTransform {
    const { x: xAttr, y: yAttr, value: valueAttr } = config.attributes;
    const reducer = config.options?.reducer ?? 'count';
    const binsX = config.options?.binsX ?? 10;
    const binsY = config.options?.binsY ?? 10;

    const xMapper = buildBinMapper(rows, xAttr, binsX);
    const yMapper = buildBinMapper(rows, yAttr, binsY);

    // Composite key separator unlikely to appear in bin labels
    const SEP = '\0';

    const reduced = reduceBuckets({
        rows: rows as TransformRow[],
        bucketOf: (row) => {
            const xLabel = xMapper(valueAtPath(row, xAttr));
            const yLabel = yMapper(valueAtPath(row, yAttr));
            return `${xLabel}${SEP}${yLabel}`;
        },
        valueOf: (reducer === 'count' || !valueAttr) ? undefined : (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'heatmatrix',
        attributes: ['x', 'y', 'value'],
        rows: reduced.map(bucket => {
            const sepIdx = bucket.key.indexOf(SEP);
            return {
                x: bucket.key.slice(0, sepIdx),
                y: bucket.key.slice(sepIdx + 1),
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        }),
    };
}

// ---- Per-axis bin mapper -------------------------------------------------

/**
 * Builds a function that maps a raw attribute value to its bin label.
 *
 * Detects whether the attribute is categorical (any non-finite or string value
 * present in the sample) or quantitative. Categorical attributes map to their
 * string representation; quantitative attributes are divided into `numBins`
 * fixed-width ranges with SI-formatted boundaries matching `binning-1d`.
 *
 * @param rows Full row set used to detect type and compute bin boundaries.
 * @param attr Dot-path attribute name.
 * @param numBins Number of bins when the attribute is quantitative.
 * @returns A function mapping any attribute value to a string bin label.
 */
function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number): (value: unknown) => string {
    const sampleValues = rows.map(r => r ? valueAtPath(r, attr) : null).filter(v => v != null);

    const isCategorical = sampleValues.some(v =>
        typeof v === 'string' || (typeof v === 'number' && !Number.isFinite(v as number))
    );

    if (isCategorical) {
        return (v) => String(v ?? '');
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) return (v) => String(v ?? '');

    const minValue = Math.min(...nums);
    const maxValue = Math.max(...nums);
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    // Integer-rounded boundaries for cleaner SI formatting (mirrors binning-1d)
    const roundedMin = Math.round(minValue);
    const roundedMax = Math.max(roundedMin + 1, Math.round(maxValue));
    const roundedBinWidth = (roundedMax - roundedMin) / numBins;
    const fmt = d3.format('.2s');

    return (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 'unknown';
        const normalized = span === 0 ? 0 : (n - minValue) / binWidth;
        const bin = Math.max(0, Math.min(Math.floor(normalized), numBins - 1));
        return span === 0
            ? fmt(roundedMin)
            : `${fmt(roundedMin + Math.round(bin * roundedBinWidth))}-${fmt(roundedMin + Math.round((bin + 1) * roundedBinWidth))}`;
    };
}
