import { LayerTable } from '../../shared/interfaces';

export type LayerType = 'surface' | 'coastline' | 'water' | 'parks' | 'roads' | 'buildings';

export interface Params {
  layer: LayerType;
  coordinateFormat?: string;
  tableName: string;
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}

export interface Returns {
  table: LayerTable;
  layers: Array<Layer>;
}
