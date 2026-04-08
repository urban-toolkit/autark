/**
 * Binning-1d transform preset.
 *
 * Aggregates a single numeric or categorical column into fixed-width bins,
 * preserving source feature provenance (`autkIds`) on every output row.
 */

import * as d3 from 'd3';

import { valueAtPath } from '../../core-types';

import type { AutkDatum, Binning1dTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinning1d`.
 *
 * Carries the fixed attribute tuple `['label', 'value']` and the binned rows
 * ready for bar-chart rendering.
 */
export type ExecutedBinning1dTransform = {
    preset: 'binning-1d';
    rows: Binning1dBinRow[];
};

/**
 * A single bin row ready for chart rendering.
 *
 * `label` is either a category string or a formatted numeric range such as `"1k-2k"`.
 * `order` is the numeric sort key for the bin (bin index for quantitative, insertion order for categorical).
 */
export type Binning1dBinRow = {
    /** Bin label — category string or formatted numeric range such as `"1k-2k"`. */
    label: string;
    /** Numeric sort key for this bin (bin index for quantitative, insertion order for categorical). */
    order: number;
    /** The reduced numeric result (count, sum, avg, min, or max) for this bin. */
    value: number;
    /** How many rows fell into this bin. */
    count: number;
    /** Merged source feature ids from all rows in this bin, used for selection linking. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a binning-1d transform and returns chart-ready rows.
 *
 * Detects whether the value attribute is categorical or quantitative, builds a
 * bin-label mapper, then groups rows by bin label and reduces using the specified reducer.
 *
 * @param rows - Input feature data to bin.
 * @param config - Transform configuration, including reducer, bin count, and optional value column.
 * @param columns - Ordered attribute names; `columns[0]` is the value axis attribute.
 */
export function runBinning1d(rows: AutkDatum[], config: Binning1dTransformConfig, columns: string[]): ExecutedBinning1dTransform {
    const valueAttr = columns[0] ?? '';
    const reducer = config.options?.reducer ?? 'count';
    const numBins = config.options?.bins ?? 10;

    const mapper = buildBinMapper(rows, valueAttr, numBins);

    const reduced = reduceBuckets({
        rows,
        bucketOf: (row) => mapper.label(valueAtPath(row, valueAttr)),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const col = config.options?.value ?? valueAttr;
            const v = Number(valueAtPath(row, col));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'binning-1d',
        rows: reduced
            .map(bucket => ({
                label: bucket.key,
                order: mapper.order(bucket.key),
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            }))
            .sort((a, b) => a.order - b.order),
    };
}

// ---- Bin mapper ---------------------------------------------------------

/**
 * Builds label and order mappers for a single axis attribute.
 *
 * Detects whether the attribute is categorical or quantitative. Categorical
 * attributes map to their string representation; quantitative attributes are
 * divided into `numBins` fixed-width ranges with SI-formatted boundaries.
 *
 * @param rows - Input data used to infer the attribute's type and numeric range.
 * @param attr - Dot-path attribute name to map.
 * @param numBins - Number of equal-width bins for quantitative attributes.
 */
export function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number) {
    const sampleValues = rows.map(r => r ? valueAtPath(r, attr) : null).filter(v => v != null);

    const isCategorical = sampleValues.some(v =>
        typeof v === 'string' || (typeof v === 'number' && !Number.isFinite(v as number))
    );

    if (isCategorical) {
        const insertionOrder = new Map<string, number>();
        const rank = (label: string): number => {
            if (!insertionOrder.has(label)) insertionOrder.set(label, insertionOrder.size);
            return insertionOrder.get(label)!;
        };

        return {
            label: (v: unknown) => { const s = String(v ?? ''); rank(s); return s; },
            order: (label: string) => rank(label),
        };
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) {
        return { label: (v: unknown) => String(v ?? ''), order: () => 0 };
    }

    const minValue = Math.min(...nums);
    const maxValue = Math.max(...nums);
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    const roundedMin = Math.round(minValue);
    const roundedMax = Math.max(roundedMin + 1, Math.round(maxValue));
    const roundedBinWidth = (roundedMax - roundedMin) / numBins;
    const fmt = d3.format('.2s');

    const labelToOrder = new Map<string, number>();
    for (let bin = 0; bin < numBins; bin++) {
        const label = `${fmt(roundedMin + Math.round(bin * roundedBinWidth))}-${fmt(roundedMin + Math.round((bin + 1) * roundedBinWidth))}`;
        if (!labelToOrder.has(label)) labelToOrder.set(label, bin);
    }
    if (span === 0) labelToOrder.set(fmt(roundedMin), 0);

    return {
        label: (v: unknown) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 'unknown';
            const normalized = span === 0 ? 0 : (n - minValue) / binWidth;
            const bin = Math.max(0, Math.min(Math.floor(normalized), numBins - 1));
            return span === 0
                ? fmt(roundedMin)
                : `${fmt(roundedMin + Math.round(bin * roundedBinWidth))}-${fmt(roundedMin + Math.round((bin + 1) * roundedBinWidth))}`;
        },
        order: (label: string) => labelToOrder.get(label) ?? 0,
    };
}
