/**
 * Binning-1d transform preset.
 *
 * Aggregates a single numeric or categorical column into fixed-width bins,
 * preserving source feature provenance (`autkIds`) on every output row.
 */

import { valueAtPath } from '../../core-types';
import type { AutkDatum, Binning1dTransformConfig } from '../../api';
import type { TransformRow } from '../kernel';
import { reduceBuckets } from '../kernel';
import { buildBinMapper } from './binning-2d';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinning1d`.
 *
 * Carries the fixed attribute tuple `['label', 'value']` and the binned rows
 * ready for bar-chart rendering.
 */
export type ExecutedBinning1dTransform = {
    preset: 'binning-1d';
    attributes: ['label', 'value'];
    rows: Binning1dBinRow[];
};

/**
 * A single bin row ready for chart rendering.
 *
 * `label` is either a category string or a formatted numeric range such as `"1k-2k"`.
 * `order` is the numeric sort key for the bin (bin index for quantitative, insertion order for categorical).
 */
export type Binning1dBinRow = {
    label: string;
    order: number;
    value: number;
    count: number;
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a binning-1d transform and returns chart-ready rows.
 *
 * Detects whether the value attribute is categorical or quantitative, builds a
 * bin-label mapper, then groups rows by bin label and reduces using the specified reducer.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Binning-1d transform configuration
 * @returns Executed binning-1d transform result
 */
export function runBinning1d(rows: AutkDatum[], config: Binning1dTransformConfig): ExecutedBinning1dTransform {
    const { value: valueAttr } = config.attributes;
    const reducer = config.options?.reducer ?? 'count';
    const numBins = config.options?.bins ?? 10;

    const mapper = buildBinMapper(rows, valueAttr, numBins);

    const reduced = reduceBuckets({
        rows: rows as TransformRow[],
        bucketOf: (row) => mapper.label(valueAtPath(row, valueAttr)),
        valueOf: reducer === 'count' ? undefined : (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    return {
        preset: 'binning-1d',
        attributes: ['label', 'value'],
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
