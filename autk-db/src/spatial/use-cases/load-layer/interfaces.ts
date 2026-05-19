import { LayerType, BoundingBox } from 'autk-core';

export type { LayerType };

export interface LoadLayerParams {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
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
