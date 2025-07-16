import { BoundingBox } from '../../../shared/interfaces';

export type LayerType =
  | 'surface'
  | 'coastline'
  | 'water'
  | 'parks'
  | 'roads'
  | 'buildings'
  | 'lines'
  | 'boundaries'
  | 'heatmap';

export function isLayerType(value: string): value is LayerType {
  return ['surface', 'coastline', 'water', 'parks', 'roads', 'buildings', 'lines', 'boundaries', 'heatmap'].includes(value);
}

export interface Params {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
  polygon?: number[][]; // Array of [lon, lat] coordinates forming a polygon (optional)
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}
