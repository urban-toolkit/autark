import { valueAtPath } from 'autk-core';
import type { TransformRow } from '../kernel';

export type HistogramPresetOptions<T extends TransformRow> = {
    rows: T[];
    column: string;
    numBins: number;
    divisor?: number;
    labelSuffix?: string;
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
    const { rows, column, numBins, divisor = 1, labelSuffix = '' } = options;

    const binCounts = new Array(numBins).fill(0);
    const binToFeatureIds: number[][] = Array.from({ length: numBins }, () => []);

    rows.forEach((row, rowIndex) => {
        const val = valueAtPath(row, column);
        if (val == null) return;

        const numVal = Number(val);
        if (!Number.isFinite(numVal)) return;

        const bin = Math.max(0, Math.min(Math.floor(numVal / divisor), numBins - 1));
        const rowAutkIds = Array.isArray(row.autkIds) && row.autkIds.length > 0
            ? row.autkIds
            : [rowIndex];

        binCounts[bin] += 1;
        binToFeatureIds[bin].push(...rowAutkIds);
    });

    return Array.from({ length: numBins }, (_, i) => ({
        label: `${i}-${i + 1}${labelSuffix}`,
        count: binCounts[i],
        autkIds: Array.from(new Set(binToFeatureIds[i])),
    }));
}