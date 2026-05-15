import type { LayerType, BoundingBox } from '../../types-core';

export type { LayerType };

export interface LoadLayerParams {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
  /** CRS of the OSM input data (source). Defaults to EPSG:4326. */
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
  workspace?: string;
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}
