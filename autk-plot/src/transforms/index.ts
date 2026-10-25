/**
 * Transform pipeline entry point and re-exports.
 *
 * Exposes the shared transform kernel, all preset runners, and the top-level
 * `run` dispatcher. Internal modules and the public API import from here
 * instead of from individual preset files.
 */

import type { AutkDatum } from '../types-plot';
import type { PlotTransformConfig } from '../api';
import type { ExecutedBinning1dTransform } from './presets/binning-1d';
import type { ExecutedBinning2dTransform } from './presets/binning-2d';
import type { ExecutedSortTransform } from './presets/sort';
import type { ExecutedBinningEventsTransform } from './presets/binning-events';
import type { ExecutedReduceSeriesTransform } from './presets/reduce-series';
import type { ExecutedBoxStatsTransform } from './presets/box-stats';
import type { ExecutedFlowsTransform } from './presets/flows';
import type { ExecutedBinningHexTransform } from './presets/binning-hex';
import type { ExecutedHierarchyTransform } from './presets/hierarchy';
import type { ExecutedCumulativeTransform } from './presets/cumulative';
import type { ExecutedFoldTransform } from './presets/fold';
import type { ExecutedDensityTransform } from './presets/density';

import { runBinning1d } from './presets/binning-1d';
import { runBinning2d } from './presets/binning-2d';
import { runSort } from './presets/sort';
import { runBinningEvents } from './presets/binning-events';
import { runReduceSeries } from './presets/reduce-series';
import { runBoxStats } from './presets/box-stats';
import { runFlows } from './presets/flows';
import { runBinningHex } from './presets/binning-hex';
import { runHierarchy } from './presets/hierarchy';
import { runCumulative } from './presets/cumulative';
import { runFold } from './presets/fold';
import { runDensity } from './presets/density';
import { runRegistered } from './registry';
import type { ExecutedRegisteredTransform } from './registry';

// ---- Public row types ---------------------------------------------------

export type {  ExecutedSortTransform } from './presets/sort';
export type { Binning1dBinRow, ExecutedBinning1dTransform } from './presets/binning-1d';
export type { Binning2dCellRow, ExecutedBinning2dTransform } from './presets/binning-2d';
export type { BinningEventsBucketRow, ExecutedBinningEventsTransform } from './presets/binning-events';
export type { ReduceSeriesBucketRow, ExecutedReduceSeriesTransform } from './presets/reduce-series';
export type { BoxStatsRow, ExecutedBoxStatsTransform } from './presets/box-stats';
export type { FlowRow, FlowNodeRow, FlowLinkRow, ExecutedFlowsTransform } from './presets/flows';
export type { BinningHexRow, ExecutedBinningHexTransform } from './presets/binning-hex';
export type { HierarchyNodeRow, ExecutedHierarchyTransform } from './presets/hierarchy';
export type { CumulativeRow, ExecutedCumulativeTransform } from './presets/cumulative';
export type { FoldCellRow, ExecutedFoldTransform } from './presets/fold';
export type { DensityPointRow, ExecutedDensityTransform } from './presets/density';

// ---- Extension: user-defined transforms and provenance building blocks ---

export { registerTransform, unregisterTransform, registeredTransform, shapeFields } from './registry';
export type { RowShape, TransformDefinition, TransformOutput, ExecutedRegisteredTransform } from './registry';
export { collectBuckets } from './kernel';
export type { CollectedBucket } from './kernel';
export {
    binnedProvenance,
    unnestedProvenance,
    flowProvenance,
    hierarchyProvenance,
    cumulativeProvenance,
    rowwiseProvenance,
    indexedBins,
} from './provenance';

// ---- Kernel public surface ----------------------------------------------

export { reduceBuckets } from './kernel';
export type { ReducedBucket, Row } from './kernel';

// ---- Discriminated union ------------------------------------------------

/**
 * Discriminated union of all executed transform result types.
 */
export type ExecutedPlotTransform =
    | ExecutedBinning1dTransform
    | ExecutedBinning2dTransform
    | ExecutedSortTransform
    | ExecutedBinningEventsTransform
    | ExecutedReduceSeriesTransform
    | ExecutedBoxStatsTransform
    | ExecutedFlowsTransform
    | ExecutedBinningHexTransform
    | ExecutedHierarchyTransform
    | ExecutedCumulativeTransform
    | ExecutedFoldTransform
    | ExecutedDensityTransform
    | ExecutedRegisteredTransform;

// ---- Top-level dispatcher -----------------------------------------------

/**
 * Runs a plot transform config through the preset pipeline.
 *
 * @param rows Input rows to transform.
 * @param config Transform configuration selecting the preset runner.
 * @param columns Ordered source columns passed to the chosen preset.
 * @returns Executed transform payload tagged with its preset discriminator.
 * @throws Never throws. Falls through to the last preset when unrecognized.
 * @example
 * const result = run(data, { preset: 'binning-1d', options: { bins: 10 } }, ['area']);
 */
export function run(rows: AutkDatum[], config: PlotTransformConfig, columns: string[]): ExecutedPlotTransform {
    if (config.preset === 'binning-1d') return runBinning1d(rows, config, columns);
    if (config.preset === 'binning-2d') return runBinning2d(rows, config, columns);
    if (config.preset === 'sort') return runSort(rows, config, columns);
    if (config.preset === 'binning-events') return runBinningEvents(rows, config, columns);
    if (config.preset === 'box-stats') return runBoxStats(rows, config, columns);
    if (config.preset === 'flows') return runFlows(rows, config, columns);
    if (config.preset === 'binning-hex') return runBinningHex(rows, config, columns);
    if (config.preset === 'hierarchy') return runHierarchy(rows, config, columns);
    if (config.preset === 'cumulative') return runCumulative(rows, config, columns);
    if (config.preset === 'fold') return runFold(rows, config, columns);
    if (config.preset === 'density') return runDensity(rows, config, columns);
    if (config.preset === 'registered') return runRegistered(rows, config, columns);
    return runReduceSeries(rows, config, columns);
}
