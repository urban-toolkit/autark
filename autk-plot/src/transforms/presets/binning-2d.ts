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

import type { AutkDatum, Binning2dTransformConfig } from '../../api';
import type { TransformRow } from '../kernel';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinning2d`.
 *
 * Carries the fixed attribute tuple `['x', 'y', 'value']` and the aggregated
 * cell rows ready for heat matrix rendering.
 */
export type ExecutedBinning2dTransform = {
    preset: 'binning-2d';
    attributes: ['x', 'y', 'value'];
    rows: Binning2dCellRow[];
};

/**
 * A single aggregated cell ready for chart rendering.
 *
 * `x` and `y` are the bin labels for this cell — either a category string or a
 * formatted numeric range such as `"1k-2k"`.
 */
export type Binning2dCellRow = {
    x: string;
    y: string;
    /** Numeric sort key for the x bin (bin index for quantitative, insertion order for categorical). */
    xOrder: number;
    /** Numeric sort key for the y bin (bin index for quantitative, insertion order for categorical). */
    yOrder: number;
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
export function runBinning2d(rows: AutkDatum[], config: Binning2dTransformConfig): ExecutedBinning2dTransform {
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
            const xLabel = xMapper.label(valueAtPath(row, xAttr));
            const yLabel = yMapper.label(valueAtPath(row, yAttr));
            return `${xLabel}${SEP}${yLabel}`;
        },
        valueOf: (reducer === 'count' || !valueAttr) ? undefined : (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'binning-2d',
        attributes: ['x', 'y', 'value'],
        rows: reduced.map(bucket => {
            const sepIdx = bucket.key.indexOf(SEP);
            const xLabel = bucket.key.slice(0, sepIdx);
            const yLabel = bucket.key.slice(sepIdx + 1);
            return {
                x: xLabel,
                y: yLabel,
                xOrder: xMapper.order(xLabel),
                yOrder: yMapper.order(yLabel),
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        }),
    };
}

// ---- Per-axis bin mapper -------------------------------------------------

/**
 * Return type for `buildBinMapper`.
 *
 * `label` formats a raw value to its display string via d3.format.
 * `order` returns the numeric sort key for a given label (bin index for
 * quantitative axes, insertion rank for categorical axes).
 */
export type BinMapper = {
    label: (value: unknown) => string;
    order: (label: string) => number;
};

/**
 * Builds label and order mappers for a single axis attribute.
 *
 * Detects whether the attribute is categorical (any non-finite or string value
 * present in the sample) or quantitative. Categorical attributes map to their
 * string representation; quantitative attributes are divided into `numBins`
 * fixed-width ranges with SI-formatted boundaries matching `binning-1d`.
 *
 * @param rows Full row set used to detect type and compute bin boundaries.
 * @param attr Dot-path attribute name.
 * @param numBins Number of bins when the attribute is quantitative.
 * @returns BinMapper with `label` and `order` functions.
 */
export function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number): BinMapper {
    const sampleValues = rows.map(r => r ? valueAtPath(r, attr) : null).filter(v => v != null);

    const isCategorical = sampleValues.some(v =>
        typeof v === 'string' || (typeof v === 'number' && !Number.isFinite(v as number))
    );

    if (isCategorical) {
        // Track insertion order so the renderer can sort categoricals consistently.
        const insertionOrder = new Map<string, number>();
        const rank = (label: string): number => {
            if (!insertionOrder.has(label)) insertionOrder.set(label, insertionOrder.size);
            return insertionOrder.get(label)!;
        };
        return {
            label: (v) => { const s = String(v ?? ''); rank(s); return s; },
            order: (label) => rank(label),
        };
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) {
        return { label: (v) => String(v ?? ''), order: () => 0 };
    }

    const minValue = Math.min(...nums);
    const maxValue = Math.max(...nums);
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    // Integer-rounded boundaries for cleaner SI formatting (mirrors binning-1d)
    const roundedMin = Math.round(minValue);
    const roundedMax = Math.max(roundedMin + 1, Math.round(maxValue));
    const roundedBinWidth = (roundedMax - roundedMin) / numBins;
    const fmt = d3.format('.2s');

    // Pre-build label → bin-index map so order() is O(1) without re-parsing.
    const labelToOrder = new Map<string, number>();
    for (let bin = 0; bin < numBins; bin++) {
        const label = `${fmt(roundedMin + Math.round(bin * roundedBinWidth))}-${fmt(roundedMin + Math.round((bin + 1) * roundedBinWidth))}`;
        if (!labelToOrder.has(label)) labelToOrder.set(label, bin);
    }
    if (span === 0) labelToOrder.set(fmt(roundedMin), 0);

    return {
        label: (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 'unknown';
            const normalized = span === 0 ? 0 : (n - minValue) / binWidth;
            const bin = Math.max(0, Math.min(Math.floor(normalized), numBins - 1));
            return span === 0
                ? fmt(roundedMin)
                : `${fmt(roundedMin + Math.round(bin * roundedBinWidth))}-${fmt(roundedMin + Math.round((bin + 1) * roundedBinWidth))}`;
        },
        order: (label) => labelToOrder.get(label) ?? 0,
    };
}
