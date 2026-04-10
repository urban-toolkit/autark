/**
 * Transform pipeline entry point and re-exports.
 *
 * Exposes the shared transform kernel, all preset runners, and the top-level
 * `run` dispatcher. Internal modules and the public API import from here
 * instead of from individual preset files.
 */

import type { AutkDatum, ChartTransformConfig } from '../api';
import type { ExecutedBinning1dTransform } from './presets/binning-1d';
import type { ExecutedBinning2dTransform } from './presets/binning-2d';
import type { ExecutedSortTransform } from './presets/sort';
import type { ExecutedBinningEventsTransform } from './presets/binning-events';
import type { ExecutedReduceSeriesTransform } from './presets/reduce-series';

import { runBinning1d } from './presets/binning-1d';
import { runBinning2d } from './presets/binning-2d';
import { runSort } from './presets/sort';
import { runBinningEvents } from './presets/binning-events';
import { runReduceSeries } from './presets/reduce-series';

// ---- Public row types ---------------------------------------------------

export type {  ExecutedSortTransform } from './presets/sort';
export type { Binning1dBinRow, ExecutedBinning1dTransform } from './presets/binning-1d';
export type { Binning2dCellRow, ExecutedBinning2dTransform } from './presets/binning-2d';
export type { BinningEventsBucketRow, ExecutedBinningEventsTransform } from './presets/binning-events';
export type { ReduceSeriesBucketRow, ExecutedReduceSeriesTransform } from './presets/reduce-series';

// ---- Kernel public surface ----------------------------------------------

export { reduceBuckets } from './kernel';
export type { ReducedBucket, Row } from './kernel';

// ---- Discriminated union ------------------------------------------------

/**
 * Discriminated union of all executed transform result types.
 */
export type ExecutedChartTransform =
    | ExecutedBinning1dTransform
    | ExecutedBinning2dTransform
    | ExecutedSortTransform
    | ExecutedBinningEventsTransform
    | ExecutedReduceSeriesTransform;

// ---- Top-level dispatcher -----------------------------------------------

/**
 * Runs a chart transform config through the preset pipeline.
 *
 * Dispatches to the appropriate transform runner based on the `preset` field in the config.
 */
export function run(rows: AutkDatum[], config: ChartTransformConfig, columns: string[]): ExecutedChartTransform {
    if (config.preset === 'binning-1d') return runBinning1d(rows, config, columns);
    if (config.preset === 'binning-2d') return runBinning2d(rows, config, columns);
    if (config.preset === 'sort') return runSort(rows, config, columns);
    if (config.preset === 'binning-events') return runBinningEvents(rows, config, columns);
    return runReduceSeries(rows, config, columns);
}
