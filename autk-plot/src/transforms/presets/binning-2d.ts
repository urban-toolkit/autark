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

import { valueAtPath } from '../../core-types';

import type { AutkDatum, Binning2dTransformConfig } from '../../api';

import { reduceBuckets } from '../kernel';
import { buildBinMapper } from './binning-1d';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinning2d`.
 *
 * Carries the fixed attribute tuple `['x', 'y', 'value']` and the aggregated
 * cell rows ready for heat matrix rendering.
 */
export type ExecutedBinning2dTransform = {
    preset: 'binning-2d';
    rows: Binning2dCellRow[];
};

/**
 * A single aggregated cell ready for chart rendering.
 *
 * `x` and `y` are the bin labels for this cell — either a category string or a
 * formatted numeric range such as `"1k-2k"`.
 */
export type Binning2dCellRow = {
    /** Bin label for the x axis — category string or formatted numeric range such as `"1k-2k"`. */
    x: string;
    /** Bin label for the y axis — category string or formatted numeric range such as `"1k-2k"`. */
    y: string;
    /** Numeric sort key for the x bin (bin index for quantitative, insertion order for categorical). */
    xOrder: number;
    /** Numeric sort key for the y bin (bin index for quantitative, insertion order for categorical). */
    yOrder: number;
    /** The reduced numeric result (count, sum, avg, min, or max) for this cell. */
    value: number;
    /** How many rows fell into this cell. */
    count: number;
    /** Merged source feature ids from all rows in this cell, used for selection linking. */
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
 * @param rows - Input feature data to aggregate.
 * @param config - Transform configuration, including reducer, per-axis bin counts, and optional value column.
 * @param columns - Ordered attribute names; `columns[0]` is the x axis, `columns[1]` is the y axis.
 */
export function runBinning2d(rows: AutkDatum[], config: Binning2dTransformConfig, columns: string[]): ExecutedBinning2dTransform {
    const xAttr = columns[0] ?? '';
    const yAttr = columns[1] ?? '';
    const valueAttr = config.options?.value;
    const reducer = config.options?.reducer ?? 'count';
    const binsX = config.options?.binsX ?? 10;
    const binsY = config.options?.binsY ?? 10;

    const xMapper = buildBinMapper(rows, xAttr, binsX);
    const yMapper = buildBinMapper(rows, yAttr, binsY);

    // Composite key separator unlikely to appear in bin labels
    const SEP = '\0';

    const reduced = reduceBuckets({
        rows,
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
