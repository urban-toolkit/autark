/**
 * Creates a spatial grid and aggregates source data into raster bands (heatmap).
 *
 * The use case generates a grid table, performs spatial joins to aggregate values,
 * and converts the aggregated results into raster-friendly band metadata.
 *
 * @module build-heatmap
 */
export { BuildHeatmapUseCase } from './use-case';
export type { BuildHeatmapParams, HeatmapAggregateFunction } from './interfaces';
