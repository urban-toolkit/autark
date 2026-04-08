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
import type { ExecutedTemporalTransform } from './presets/temporal';
import type { ExecutedTimeseriesTransform } from './presets/timeseries';

import { runBinning1d } from './presets/binning-1d';
import { runBinning2d } from './presets/binning-2d';
import { runSort } from './presets/sort';
import { runTemporal } from './presets/temporal';
import { runTimeseries } from './presets/timeseries';

// ---- Public row types ---------------------------------------------------

export type {  ExecutedSortTransform } from './presets/sort';
export type { Binning1dBinRow, ExecutedBinning1dTransform } from './presets/binning-1d';
export type { Binning2dCellRow, ExecutedBinning2dTransform } from './presets/binning-2d';
export type { TemporalBucketRow, ExecutedTemporalTransform } from './presets/temporal';
export type { TimeseriesBucketRow, ExecutedTimeseriesTransform } from './presets/timeseries';

// ---- Kernel public surface ----------------------------------------------

export { reduceBuckets } from './kernel';
export type { ReducedBucket } from './kernel';

// ---- Discriminated union ------------------------------------------------

/**
 * Discriminated union of all executed transform result types.
 */
export type ExecutedChartTransform =
    | ExecutedBinning1dTransform
    | ExecutedBinning2dTransform
    | ExecutedSortTransform
    | ExecutedTemporalTransform
    | ExecutedTimeseriesTransform;

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
    if (config.preset === 'temporal') return runTemporal(rows, config, columns);
    return runTimeseries(rows, config, columns);
}
