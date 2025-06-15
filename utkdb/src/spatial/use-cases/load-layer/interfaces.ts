import { BoundingBox } from '../../shared/use-cases/get-bounding-box/interfaces';

export type LayerType = 'surface' | 'coastline' | 'water' | 'parks' | 'roads' | 'buildings' | 'custom2DLayer';

export function isLayerType(value: string): value is LayerType {
  return ['surface', 'coastline', 'water', 'parks', 'roads', 'buildings', 'custom2DLayer'].includes(value);
}

export interface Params {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}
