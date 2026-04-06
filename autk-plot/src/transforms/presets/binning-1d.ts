/**
 * Histogram transform preset.
 *
 * Aggregates a single numeric or categorical column into fixed-width bins,
 * preserving source feature provenance (`autkIds`) on every output row.
 */

import * as d3 from 'd3';

import { valueAtPath } from '../../core-types';
import type { AutkDatum, HistogramTransformConfig } from '../../api';
import type { TransformRow } from '../kernel';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runHistogram`.
 *
 * Carries the fixed attribute tuple `['label', 'count']` and the binned rows
 * ready for bar-chart rendering.
 */
export type ExecutedHistogramTransform = {
    preset: 'histogram';
    attributes: ['label', 'count'];
    rows: HistogramBinRow[];
};

/**
 * Runs a histogram transform and returns chart-ready rows.
 *
 * Aggregates values into histogram bins (numeric or categorical) and returns chart-ready rows.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Histogram transform configuration
 * @returns Executed histogram transform result
 */
export function runHistogram(rows: AutkDatum[], config: HistogramTransformConfig): ExecutedHistogramTransform {
    return {
        preset: 'histogram',
        attributes: ['label', 'count'],
        rows: presetHistogram({
            rows,
            column: config.attributes.value,
            numBins: config.options?.bins ?? 10,
        }),
    };
}

// ---- Preset algorithm ---------------------------------------------------

/**
 * Options accepted by `presetHistogram`.
 *
 * @template T Row type extending `TransformRow`.
 */
export type HistogramPresetOptions<T extends TransformRow> = {
    /** Input rows to bin. */
    rows: T[];
    /** Dot-path attribute name whose values are binned. */
    column: string;
    /** Number of bins for quantitative columns. Ignored for categorical columns. */
    numBins: number;
};

/**
 * A single histogram bin ready for chart rendering.
 *
 * `label` is either a category string or a formatted numeric range such as `"1k-2k"`.
 */
export type HistogramBinRow = {
    label: string;
    count: number;
    autkIds: number[];
};

/**
 * Aggregates values into histogram bins (numeric or categorical).
 *
 * Detects column type and delegates to categorical or quantitative binning.
 *
 * @param options Histogram preset options (rows, column, numBins)
 * @returns Array of histogram bin rows
 */
export function presetHistogram<T extends TransformRow>(
    options: HistogramPresetOptions<T>
): HistogramBinRow[] {
    const { rows, column, numBins } = options;

    // Detect if the column is categorical (non-numeric)
    const isCategorical = rows.some(row => {
        const val = valueAtPath(row, column);
        return typeof val === 'string' || (typeof val === 'number' && !Number.isFinite(val));
    });

    if (isCategorical) {
        return categoricalHistogram(rows, column);
    } else {
        return quantitativeHistogram(rows, column, numBins);
    }
}

// ---- Helper functions ----------------------------------------------------


/**
 * Aggregates categorical values into histogram bins.
 *
 * @param rows Input data rows
 * @param column Column name to bin
 * @returns Array of histogram bin rows for each category
 */
function categoricalHistogram<T extends TransformRow>(rows: T[], column: string): HistogramBinRow[] {
    const categoryMap = new Map<string, { count: number, autkIds: number[] }>();
    rows.forEach((row, rowIndex) => {
        const val = valueAtPath(row, column);
        if (val == null) return;
        const key = String(val);
        if (!categoryMap.has(key)) {
            categoryMap.set(key, { count: 0, autkIds: [] });
        }
        const entry = categoryMap.get(key)!;
        entry.count += 1;
        entry.autkIds.push(...(Array.isArray(row.autkIds) && row.autkIds.length > 0 ? row.autkIds : [rowIndex]));
    });
    return Array.from(categoryMap.entries()).map(([label, { count, autkIds }]) => ({
        label,
        count,
        autkIds: Array.from(new Set(autkIds)),
    }));
}

/**
 * Aggregates numeric values into fixed-width histogram bins.
 *
 * @param rows Input data rows
 * @param column Column name to bin
 * @param numBins Number of bins
 * @returns Array of histogram bin rows for each numeric bin
 */
function quantitativeHistogram<T extends TransformRow>(rows: T[], column: string, numBins: number): HistogramBinRow[] {
    if (!Number.isFinite(numBins) || numBins <= 0) {
        return [];
    }

    const values: Array<{ value: number; autkIds: number[] }> = [];

    rows.forEach((row, rowIndex) => {
        const val = valueAtPath(row, column);
        if (val == null) return;

        const numVal = Number(val);
        if (!Number.isFinite(numVal)) return;

        values.push({
            value: numVal,
            autkIds: Array.isArray(row.autkIds) && row.autkIds.length > 0 ? row.autkIds : [rowIndex],
        });
    });

    if (values.length === 0) {
        return Array.from({ length: numBins }, (_, i) => ({
            label: `${i}-${i + 1}`,
            count: 0,
            autkIds: [],
        }));
    }

    const minValue = Math.min(...values.map((d) => d.value));
    const maxValue = Math.max(...values.map((d) => d.value));
    const span = maxValue - minValue;
    const binWidth = span === 0 ? 1 : span / numBins;

    const binCounts = new Array(numBins).fill(0);
    const binToFeatureIds: number[][] = Array.from({ length: numBins }, () => []);

    values.forEach(({ value, autkIds }) => {
        const normalized = span === 0 ? 0 : (value - minValue) / binWidth;
        const bin = Math.max(0, Math.min(Math.floor(normalized), numBins - 1));

        binCounts[bin] += 1;
        binToFeatureIds[bin].push(...autkIds);
    });

    const formatLabelValue = d3.format('.2s');
    
    // Ensure bin boundaries are integers for cleaner SI formatting
    const roundedMinValue = Math.round(minValue);
    const roundedMaxValue = Math.max(roundedMinValue + 1, Math.round(maxValue));
    const roundedBinWidth = (roundedMaxValue - roundedMinValue) / numBins;

    return Array.from({ length: numBins }, (_, i) => ({
        label: span === 0
            ? formatLabelValue(roundedMinValue)
            : `${formatLabelValue(roundedMinValue + Math.round(i * roundedBinWidth))}-${formatLabelValue(roundedMinValue + Math.round((i + 1) * roundedBinWidth))}`,
        count: binCounts[i],
        autkIds: Array.from(new Set(binToFeatureIds[i])),
    }));
}