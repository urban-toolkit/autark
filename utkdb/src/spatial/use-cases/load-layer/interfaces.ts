export type LayerType = 'surface' | 'coastline' | 'water' | 'parks' | 'roads' | 'buildings';

export interface Params {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
  coordinateFormat?: string;
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}
