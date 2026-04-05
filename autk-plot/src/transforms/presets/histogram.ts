import * as d3 from 'd3';

import { valueAtPath } from '../../core-types';
import type { AutkDatum, HistogramTransformConfig } from '../../api';
import type { TransformRow } from '../kernel';

// ---- Executed transform -------------------------------------------------

export type ExecutedHistogramTransform = {
    preset: 'histogram';
    attributes: ['label', 'count'];
    rows: HistogramBinRow[];
};

/**
 * Runs a histogram transform and returns chart-ready rows.
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

export type HistogramPresetOptions<T extends TransformRow> = {
    rows: T[];
    column: string;
    numBins: number;
};

export type HistogramBinRow = {
    label: string;
    count: number;
    autkIds: number[];
};

/**
 * Aggregates numeric values into fixed histogram bins.
 */
export function presetHistogram<T extends TransformRow>(
    options: HistogramPresetOptions<T>
): HistogramBinRow[] {
    const { rows, column, numBins } = options;

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