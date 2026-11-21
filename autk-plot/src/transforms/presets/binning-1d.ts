/**
 * Binning-1d transform preset.
 *
 * Aggregates a single numeric or categorical column into fixed-width bins,
 * preserving source feature provenance (`autkIds`) on every output row.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { Binning1dTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';
import { formatSiOrDecimal } from '../../number-format';

/** Label of the bin of a quantitative attribute's values that hold no number: missing, null or not finite. */
const UNKNOWN = 'unknown';

/** A difference under this fraction of a bin width is rounding error: a bin edge this close to 0 is 0. */
const ROUNDING_TOLERANCE = 1e-9;

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinning1d`.
 *
 * Carries the fixed attribute tuple `['label', 'value']` and the binned rows
 * ready for bar-plot rendering.
 */
export type ExecutedBinning1dTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'binning-1d';
    /** Binned rows ready for downstream plot rendering. */
    rows: Binning1dBinRow[];
};

/**
 * A single bin row ready for plot rendering.
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
 * Runs a binning-1d transform and returns plot-ready rows.
 *
 * Detects whether the value attribute is categorical or quantitative, builds a
 * bin mapper, then groups rows by bin and reduces using the specified reducer.
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
        bucketOf: (row) => mapper.key(valueAtPath(row, valueAttr)),
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
                label: mapper.label(bucket.key),
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
 * Maps the values of one attribute to bins: the key rows are grouped by, and each bin's label and order.
 */
export type BinMapper = {
    /** Key of the bin a value falls in: its category, or the index of its numeric range. */
    key: (value: unknown) => string;
    /** Label of a bin: its category, or its numeric range such as `"1.0k-2.0k"`. */
    label: (key: string) => string;
    /** Sort key of a bin: the category's first-seen rank, or the numeric range's index, the unknown bin after the ranges. */
    order: (key: string) => number;
};

/**
 * Builds the bin mapper of a single axis attribute.
 *
 * Detects whether the attribute is categorical or quantitative. Categorical
 * attributes map to their string representation; quantitative attributes are
 * divided into `numBins` fixed-width ranges, keyed by their index and labeled
 * by their SI-formatted boundaries. A value of a quantitative attribute that holds
 * no number (missing, null or not finite) goes to an `unknown` bin after the ranges.
 *
 * @param rows - Input data used to infer the attribute's type and numeric range.
 * @param attr - Dot-path attribute name to map.
 * @param numBins - Number of equal-width bins for quantitative attributes.
 */
export function buildBinMapper(rows: AutkDatum[], attr: string, numBins: number): BinMapper {
    const sampleValues = rows.map(r => r ? valueAtPath(r, attr) : null).filter(v => v != null);
    const isNumericLike = (value: unknown): boolean => {
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value !== 'string') return false;

        const trimmed = value.trim();
        return trimmed.length > 0 && Number.isFinite(Number(trimmed));
    };

    // A number that is not finite, such as NaN, holds no value, as null does: it does not make the attribute categorical.
    const isCategorical = sampleValues.some(v =>
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
            key: (v: unknown) => { const s = String(v ?? ''); rank(s); return s; },
            label: (key: string) => key,
            order: (key: string) => rank(key),
        };
    }

    const nums = sampleValues.map(Number).filter(Number.isFinite);
    if (nums.length === 0) {
        return { key: (v: unknown) => String(v ?? ''), label: (key: string) => key, order: () => 0 };
    }

    const minValue = Math.min(...nums);
    const maxValue = Math.max(...nums);
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    // A single value is one bin, labeled by that value; otherwise each bin is labeled by its edges. An edge that
    // rounding leaves next to 0, such as -0.3 + 3 * 0.1 (5.6e-17), is 0.
    const edges = span === 0
        ? [minValue]
        : Array.from({ length: numBins + 1 }, (_, i) => {
            const edge = i === numBins ? maxValue : minValue + i * binWidth;
            return Math.abs(edge) < binWidth * ROUNDING_TOLERANCE ? 0 : edge;
        });
    const texts = formatBinEdges(edges, binWidth);
    const labels = span === 0 ? texts : texts.slice(0, -1).map((text, i) => `${text}-${texts[i + 1]}`);

    // Rows are grouped by bin index, so two bins never merge, even if their labels read alike.
    return {
        key: (v: unknown) => {
            // A value that holds no number, missing, null or NaN, goes to a bin of its own: null is not 0.
            const n = v == null ? NaN : Number(v);
            if (!Number.isFinite(n)) return UNKNOWN;
            const normalized = span === 0 ? 0 : (n - minValue) / binWidth;
            return String(Math.max(0, Math.min(Math.floor(normalized), numBins - 1)));
        },
        label: (key: string) => labels[Number(key)] ?? key,
        // The numeric bins are 0 to numBins - 1; the unknown bin comes after all of them.
        order: (key: string) => (key === UNKNOWN ? numBins : Number(key)),
    };
}

/**
 * Formats bin edges at the fewest significant digits, two or more, that tell each
 * edge from the next and print every edge within a tenth of a bin width of its value.
 * Values of a thousand and more keep their SI prefix ("1.5k"); values under one read
 * as decimals ("0.25", where the SI format gives "250m").
 *
 * @param edges - Bin edges in ascending order.
 * @param binWidth - Width of a bin.
 * @returns The text of each edge.
 */
function formatBinEdges(edges: number[], binWidth: number): string[] {
    let texts: string[] = [];
    for (let digits = 2; digits <= 17; digits++) {
        texts = edges.map(edge => formatBinEdge(edge, digits));
        const apart = texts.every((text, i) => i === 0 || text !== texts[i - 1]);
        // The value each text prints: the edge rounded to `digits` significant digits, as d3 rounds it.
        const close = edges.every(edge => Math.abs(Number(edge.toPrecision(digits)) - edge) <= binWidth / 10);
        if (apart && close) break;
    }
    return texts;
}

/**
 * Formats one bin edge at the given number of significant digits.
 *
 * @param value - Edge value.
 * @param digits - Significant digits.
 * @returns The edge's text.
 */
function formatBinEdge(value: number, digits: number): string {
    return formatSiOrDecimal(value, d3.format(`.${digits}s`), d3.format(`.${digits}r`));
}
