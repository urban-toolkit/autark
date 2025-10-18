import { BoundingBox, Table } from '../../../shared/interfaces';

export function isLayerTable(table: Table): boolean {
  return table.source === 'osm_layer' || table.source === 'geojson';
}

export function isOsmBuildingTable(table: Table): boolean {
  return table.source === 'osm_layer' && table.name.endsWith('_buildings');
}

export type OsmLayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings';

export interface Params {
  osmInputTableName: string;
  outputTableName?: string;
  layer: OsmLayerType;
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
