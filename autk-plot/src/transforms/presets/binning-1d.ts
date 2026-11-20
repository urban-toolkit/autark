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

import { formatSiOrDecimal } from '../../number-format';
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
 * Detects whether the attribute is categorical or quantitative, builds a bin mapper, then groups
 * rows by bin (never by label, so two bins never merge) and reduces them with the configured reducer.
 *
 * @param rows Input feature rows.
 * @param options Transform options (`transform.options`): reducer, bin count, and value column.
 * @param columns `columns[0]` is the column to bin.
 * @returns Rows of the `category-value` shape and their provenance.
 */
export function runBinning1d(
    rows: AutkDatum[],
    options: NonNullable<Binning1dTransformConfig['options']>,
    columns: string[],
): Omit<ExecutedBinning1dTransform, 'preset'> {
    const valueAttr = columns[0] ?? '';
    const reducer = options.reducer ?? 'count';
    const numBins = options.bins ?? 10;

    const mapper = buildBinMapper(rows, valueAttr, numBins);

    const reduced = collectBuckets({
        rows,
        bucketOf: (row) => mapper.key(valueAtPath(row, valueAttr)),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const col = options.value ?? valueAttr;
            const v = Number(valueAtPath(row, col));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });
    // A range of a numeric column with no row is still a bin: its row has value 0 and no
    // regions, so the axis does not skip it (categories only exist where rows are).
    const present = new Set(reduced.map(bucket => bucket.key));
    for (const key of mapper.ranges()) {
        if (!present.has(key)) reduced.push({ key, value: 0, count: 0, autkIds: [], members: [] });
    }

    const binRows = reduced
        .map(bucket => ({
            label: mapper.label(bucket.key),
            order: mapper.order(bucket.key),
            key: bucket.key,
            value: bucket.value,
            count: bucket.count,
            autkIds: bucket.autkIds,
        }))
        .sort((a, b) => a.order - b.order);

    return {
        rows: binRows.map(({ key: _key, ...row }) => row),
        provenance: binnedProvenance({
            rows,
            buckets: reduced,
            bins: indexedBins(mapper.keys(), reduced.map(bucket => bucket.key), 'bin'),
            binLabel: 'bins',
            rowKeys: binRows.map(row => row.key),
            reducer,
        }),
    };
}

// ---- Bin mapper ---------------------------------------------------------

/** Maps the values of one attribute to bins: the key rows are grouped by, and each bin's label and order. */
export type BinMapper = {
    /** Key of the bin a value falls in: its category, or the index of its numeric range. */
    key: (value: unknown) => string;
    /** Label of a bin: its category, or its numeric range such as `"1.0k-2.0k"`. */
    label: (key: string) => string;
    /** Sort key of a bin: the category's first-seen rank, or the numeric range's index. */
    order: (key: string) => number;
    /** Every key, in order: the categories seen, or every numeric range. */
    keys: () => string[];
    /** The keys of the numeric ranges, empty ones included (none for categories or one value). */
    ranges: () => string[];
};

/**
 * Builds the bin mapper of a single axis attribute.
 *
 * Detects whether the attribute is categorical or quantitative. Categorical attributes map to
 * their string representation; quantitative attributes are divided into `numBins` fixed-width
 * ranges, keyed by their index and labeled by their true edges.
 *
 * @param rows Input rows used to infer the attribute's type and numeric range.
 * @param attr Dot-path attribute name to map.
 * @param numBins Number of equal-width bins for quantitative attributes.
 * @returns The key, label and order of a bin, every key, and the keys of the numeric ranges.
 */
export function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number): BinMapper {
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
        const rank = (key: string): number => {
            const seen = insertionOrder.get(key);
            if (seen !== undefined) return seen;
            insertionOrder.set(key, insertionOrder.size);
            return insertionOrder.size - 1;
        };

        return {
            key: (v: unknown) => { const s = String(v ?? ''); rank(s); return s; },
            label: (key: string) => key,
            order: (key: string) => rank(key),
            keys: () => Array.from(insertionOrder.keys()),
            ranges: () => [],
        };
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) {
        return { key: (v: unknown) => String(v ?? ''), label: (key: string) => key, order: () => 0, keys: () => [], ranges: () => [] };
    }

    // A loop instead of Math.min(...nums): spreading a million values overflows the call stack.
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (const n of nums) {
        minValue = Math.min(minValue, n);
        maxValue = Math.max(maxValue, n);
    }
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    // A single value is one bin, labeled by that value; otherwise each bin is labeled by its edges.
    const edges = span === 0
        ? [minValue]
        : Array.from({ length: numBins + 1 }, (_, i) => (i === numBins ? maxValue : minValue + i * binWidth));
    const texts = formatBinEdges(edges, binWidth);
    const labels = span === 0 ? texts : texts.slice(0, -1).map((text, i) => `${text}-${texts[i + 1]}`);
    const keys = labels.map((_label, i) => String(i));

    // Rows are grouped by bin index, so two bins never merge, even if their labels read alike.
    return {
        key: (v: unknown) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 'unknown';
            const normalized = span === 0 ? 0 : (n - minValue) / binWidth;
            return String(Math.max(0, Math.min(Math.floor(normalized), numBins - 1)));
        },
        label: (key: string) => labels[Number(key)] ?? key,
        order: (key: string) => (key === 'unknown' ? 0 : Number(key)),
        keys: () => keys,
        // The ranges of the column, empty ones included; one value has a single label, no range.
        ranges: () => (span === 0 ? [] : keys),
    };
}

/**
 * Formats bin edges at the fewest significant digits, two or more, that tell each edge from the
 * next and print every edge within a tenth of a bin width of its value. Values of a thousand and
 * more keep their SI prefix ("1.5k"); values under one read as decimals ("0.25", where the SI
 * format gives "250m").
 *
 * @param edges Bin edges in ascending order.
 * @param binWidth Width of a bin.
 * @returns The text of each edge.
 */
function formatBinEdges(edges: number[], binWidth: number): string[] {
    let texts: string[] = [];
    for (let digits = 2; digits <= 17; digits++) {
        texts = edges.map(edge => formatSiOrDecimal(edge, d3.format(`.${digits}s`), d3.format(`.${digits}r`)));
        const apart = texts.every((text, i) => i === 0 || text !== texts[i - 1]);
        // The value each text prints: the edge rounded to `digits` significant digits, as d3 rounds it.
        const close = edges.every(edge => Math.abs(Number(edge.toPrecision(digits)) - edge) <= binWidth / 10);
        if (apart && close) break;
    }
    return texts;
}

// ---- Definition ---------------------------------------------------------

/** Rows binned by one column (categories, or equal-width ranges of numbers): one row per bin. */
export const binning1d: TransformDefinition = {
    name: 'binning-1d',
    label: 'Bins of one column',
    shape: 'category-value',
    run: runBinning1d,
};
