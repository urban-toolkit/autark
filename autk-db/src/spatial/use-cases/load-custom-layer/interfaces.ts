import { FeatureCollection } from 'geojson';
import { LayerType } from 'autk-core';
import { BoundingBox } from '../../../shared/interfaces';

export interface LoadCustomLayerParams {
  geojsonFileUrl?: string;
  geojsonObject?: FeatureCollection;
  outputTableName: string;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
  workspace?: string;
  /** Explicitly set the layer type. If omitted, auto-detected from the first feature's geometry. */
  layerType?: LayerType;
}
