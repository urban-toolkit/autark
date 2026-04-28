import { LayerType } from 'autk-core';

export type OsmLayerType = Exclude<LayerType, 'background'>;

export interface OsmProcessingConfig {
  type: OsmLayerType;
  processesRelations: boolean;
  createsPolygons: boolean;
  postProcessing?: 'building-aggregation' | 'surface-polygonization' | null;
}

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

export function getOsmProcessingConfig(layer: LayerType): OsmProcessingConfig | null {
  if (layer === 'background') return null;
  return OSM_PROCESSING_CONFIGS[layer];
}
