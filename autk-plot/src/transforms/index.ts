/**
 * Transform pipeline entry point and re-exports.
 *
 * Exposes the shared transform kernel, all preset runners, and the top-level
 * `run` dispatcher. Internal modules and the public API import from here
 * instead of from individual preset files.
 */

import type { AutkDatum, ChartTransformConfig } from '../api';
import { runBinning1d, type ExecutedBinning1dTransform } from './presets/binning-1d';
import { runBinning2d, type ExecutedBinning2dTransform } from './presets/binning-2d';
import { runSort, type ExecutedSortTransform } from './presets/sort';
import { runTemporal, type ExecutedTemporalTransform } from './presets/temporal';
import { runTimeseries, type ExecutedTimeseriesTransform } from './presets/timeseries';

/** Shared transform utilities: bucket reduction, id merging, and reducer helpers. */
export * from './kernel';
/** 1D binning preset runner, types, and bin-row shape. */
export * from './presets/binning-1d';
/** 2D binning (heat matrix) preset runner and cell-row types. */
export * from './presets/binning-2d';
/** Sort preset runner and sorted-row types. */
export * from './presets/sort';
/** Temporal preset runner, bucket-row types, and bucket-key formatter. */
export * from './presets/temporal';
/** Timeseries preset runner, bucket-row types, and point extractor. */
export * from './presets/timeseries';

/**
 * Discriminated union of all executed transform result types.
 *
 * Each variant carries a `preset` tag, `attributes` tuple, and `rows` array
 * ready for chart rendering.
 */
export type ExecutedChartTransform =
    | ExecutedBinning1dTransform
    | ExecutedBinning2dTransform
    | ExecutedSortTransform
    | ExecutedTemporalTransform
    | ExecutedTimeseriesTransform;

/**
 * Runs a chart transform config through the preset pipeline.
 *
 * Dispatches to the appropriate transform runner based on the `preset` field in the config.
 * Supported presets: 'binning-1d', 'binning-2d', 'sort', 'temporal', 'timeseries'.
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Chart transform configuration
 * @returns Executed transform result (chart-ready rows and attributes)
 */
export function run(rows: AutkDatum[], config: ChartTransformConfig): ExecutedChartTransform {
    if (config.preset === 'binning-1d') return runBinning1d(rows, config);
    if (config.preset === 'binning-2d') return runBinning2d(rows, config);
    if (config.preset === 'sort') return runSort(rows, config);
    if (config.preset === 'temporal') return runTemporal(rows, config);
    return runTimeseries(rows, config);
}
