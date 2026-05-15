import { FeatureCollection } from 'geojson';
import type { BoundingBox, LayerType } from '../../types-core';

export interface LoadCustomLayerParams {
  geojsonFileUrl?: string;
  geojsonObject?: FeatureCollection;
  outputTableName: string;
  /** CRS of the input GeoJSON data (source). Defaults to EPSG:4326. */
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
  workspace?: string;
  /** Explicitly set the layer type. If omitted, auto-detected from the first feature's geometry. */
  layerType?: LayerType;
}
