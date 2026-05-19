import type { LayerType } from '../../types-core';

/**
 * OSM-specific layer types used by the processing config (excludes `background`).
 */
export type OsmLayerType = Exclude<LayerType, 'background'>;

/**
 * Configuration describing how an OSM layer should be processed.
 *
 * @property type - The OSM layer type.
 * @property processesRelations - Whether relation members should be resolved.
 * @property createsPolygons - Whether the layer should produce polygon geometries.
 * @property postProcessing - Optional post-processing step name.
 */
export interface OsmProcessingConfig {
  type: OsmLayerType;
  processesRelations: boolean;
  createsPolygons: boolean;
  postProcessing?: 'building-aggregation' | 'surface-polygonization' | null;
}

/**
 * Default processing behaviors for each OSM layer type.
 */
export const OSM_PROCESSING_CONFIGS: Record<OsmLayerType, OsmProcessingConfig> = {
  surface:   { type: 'surface',   processesRelations: false, createsPolygons: false, postProcessing: 'surface-polygonization' },
  water:     { type: 'water',     processesRelations: true,  createsPolygons: true,  postProcessing: null },
  parks:     { type: 'parks',     processesRelations: true,  createsPolygons: true,  postProcessing: null },
  roads:     { type: 'roads',     processesRelations: false, createsPolygons: false, postProcessing: null },
  buildings: { type: 'buildings', processesRelations: true,  createsPolygons: true,  postProcessing: 'building-aggregation' },
  points:    { type: 'points',    processesRelations: false, createsPolygons: false, postProcessing: null },
  polygons:  { type: 'polygons',  processesRelations: false, createsPolygons: true,  postProcessing: null },
  polylines: { type: 'polylines', processesRelations: false, createsPolygons: false, postProcessing: null },
  raster:    { type: 'raster',    processesRelations: false, createsPolygons: false, postProcessing: null },
};

/**
 * Returns the processing configuration for an OSM `LayerType`, or `null` when the
 * layer is `background` which is not processed.
 *
 * @param layer - The layer type to query.
 * @returns The `OsmProcessingConfig` or `null`.
 * @example
 * const cfg = getOsmProcessingConfig('buildings');
 */
export function getOsmProcessingConfig(layer: LayerType): OsmProcessingConfig | null {
  if (layer === 'background') return null;
  return OSM_PROCESSING_CONFIGS[layer];
}
