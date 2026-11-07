/**
 * Transform pipeline entry point and re-exports.
 *
 * Exposes the shared transform kernel, the registry of transforms (built-in and user-defined,
 * registered the same way), and the top-level `run`. Internal modules and the public API import
 * from here instead of from individual preset files.
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

import { runTransform } from './registry';
import type { ExecutedRegisteredTransform } from './registry';
/** Registers the built-in transforms written as definitions. */
import './built-in';

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

// ---- Extension ----------------------------------------------------------
// User-defined transforms and provenance building blocks.

export { registerTransform, unregisterTransform, registeredTransform, shapeFields, shapeOutput } from './registry';
export type { RowShape, ShapeExtras, TransformDefinition, TransformOutput, ExecutedRegisteredTransform } from './registry';
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
 * Runs the transform of a plot configuration: the registered definition named
 * by `preset` (or by `name`, for `preset: 'registered'`), built-in or user.
 *
 * @param rows Input rows to transform.
 * @param config Transform configuration naming the transform and its options.
 * @param columns Ordered source columns passed to the transform.
 * @returns Rows and provenance of the transform, tagged with its preset.
 * @throws If no transform is registered under the name, or its output is malformed.
 * @example
 * const result = run(data, { preset: 'binning-1d', options: { bins: 10 } }, ['area']);
 */
export function run(rows: AutkDatum[], config: PlotTransformConfig, columns: string[]): ExecutedPlotTransform {
    return runTransform(rows, config, columns) as ExecutedPlotTransform;
}
