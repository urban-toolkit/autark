/**
 * Binning-1d transform preset.
 *
 * Groups rows by one column, by category or by equal-width numeric range, and reduces each bin,
 * keeping the source features (`autkIds`) of every bin.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { Binning1dTransformConfig } from '../../api';
import type { TransformDefinition } from '../registry';
import type { TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { binnedProvenance, indexedBins } from '../provenance';

// ---- Executed transform -------------------------------------------------

/** Result produced by `runBinning1d`. */
export type ExecutedBinning1dTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'binning-1d';
    /** Binned rows ready for downstream plot rendering. */
    rows: Binning1dBinRow[];
    /** Provenance `D0 features → D1 bins → D2 aggregates`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A single bin row ready for plot rendering. */
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
 * Runs a binning-1d transform and returns plot-ready rows.
 *
 * Detects whether the attribute is categorical or quantitative, builds a bin-label mapper, then
 * groups rows by bin label and reduces them with the configured reducer.
 *
 * @param rows Input feature rows.
 * @param options Transform options (`transform.options`): reducer, bin count, and value column.
 * @param columns `columns[0]` is the column to bin.
 * @returns Rows of the `category-value` shape and their provenance.
 */
export function runBinning1d(rows: AutkDatum[], options: NonNullable<Binning1dTransformConfig['options']>, columns: string[]): Omit<ExecutedBinning1dTransform, 'preset'> {
    const valueAttr = columns[0] ?? '';
    const reducer = options.reducer ?? 'count';
    const numBins = options.bins ?? 10;

    const mapper = buildBinMapper(rows, valueAttr, numBins);

    const reduced = collectBuckets({
        rows,
        bucketOf: (row) => mapper.label(valueAtPath(row, valueAttr)),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const col = options.value ?? valueAttr;
            const v = Number(valueAtPath(row, col));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    const binRows = reduced
        .map(bucket => ({
            label: bucket.key,
            order: mapper.order(bucket.key),
            value: bucket.value,
            count: bucket.count,
            autkIds: bucket.autkIds,
        }))
        .sort((a, b) => a.order - b.order);

    return {
        rows: binRows,
        provenance: binnedProvenance({
            rows,
            buckets: reduced,
            bins: indexedBins(mapper.labels(), reduced.map(bucket => bucket.key), 'bin'),
            binLabel: 'bins',
            rowKeys: binRows.map(row => row.label),
            reducer,
        }),
    };
}

// ---- Bin mapper ---------------------------------------------------------

/**
 * Builds label and order mappers for a single axis attribute.
 *
 * Detects whether the attribute is categorical or quantitative. Categorical attributes map to
 * their string representation; quantitative attributes are divided into `numBins` fixed-width
 * ranges with SI-formatted boundaries.
 *
 * @param rows Input rows used to infer the attribute's type and numeric range.
 * @param attr Dot-path attribute name to map.
 * @param numBins Number of equal-width bins for quantitative attributes.
 * @returns The bin label of a value, the sort order of a label, and every label in order.
 */
export function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number) {
    const sampleValues = rows.map(r => r ? valueAtPath(r, attr) : null).filter(v => v != null);
    const isNumericLike = (value: unknown): boolean => {
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value !== 'string') return false;

        const trimmed = value.trim();
        return trimmed.length > 0 && Number.isFinite(Number(trimmed));
    };

    const isCategorical = sampleValues.some(v =>
        (typeof v === 'number' && !Number.isFinite(v)) ||
        (typeof v === 'string' && !isNumericLike(v)) ||
        (typeof v !== 'number' && typeof v !== 'string')
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
            labels: () => Array.from(insertionOrder.keys()),
        };
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) {
        return { label: (v: unknown) => String(v ?? ''), order: () => 0, labels: () => [] as string[] };
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
        labels: () => Array.from(labelToOrder.keys()),
    };
}

// ---- Definition ---------------------------------------------------------

/** Rows binned by one column (categories, or equal-width ranges of numbers): one row per bin. */
export const binning1d: TransformDefinition = {
    name: 'binning-1d',
    label: 'Bins of one column',
    shape: 'category-value',
    run: runBinning1d,
};
