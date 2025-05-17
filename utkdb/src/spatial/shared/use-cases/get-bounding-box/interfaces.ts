import { LayerType } from '../../../use-cases/load-layer/interfaces';

export interface GetBoundingBoxParams {
  tableName: string;
  coordinateFormat?: string;
  layers: LayerType[];
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
