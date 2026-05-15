import { LayerType, BoundingBox } from 'autk-core';

export type { BoundingBox };

export {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_ROADS_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './consts';

export type TableSource = 'osm' | 'geojson' | 'csv' | 'json' | 'geotiff' | 'user';

export interface Column {
  name: string;
  type: string;
}

export interface BaseTable {
  source: TableSource;
  name: string;
  columns: Column[];
}

export interface OsmTable extends BaseTable {
  source: 'osm';
  type?: undefined;
}

export interface OsmLayerTable extends BaseTable {
  source: 'osm';
  type: LayerType;
}

export interface GeojsonTable extends BaseTable {
  source: 'geojson';
  type: LayerType;
}

export interface CsvTable extends BaseTable {
  source: 'csv';
  type?: undefined;
}

export interface JsonTable extends BaseTable {
  source: 'json';
  type?: undefined;
}

export interface GeotiffTable extends BaseTable {
  source: 'geotiff';
  type: 'raster';
}

export interface UserLayerTable extends BaseTable {
  source: 'user';
  type: LayerType;
}

export type GridTable = UserLayerTable & { type: 'raster' };

export interface SqlTable extends BaseTable {
  source: 'user';
  type?: undefined;
}

export type DataTable = OsmTable | CsvTable | JsonTable | SqlTable;
export type LayerTable = OsmLayerTable | GeojsonTable | GeotiffTable | UserLayerTable;
export type CollectionLayerTable = OsmLayerTable | GeojsonTable | UserLayerTable;
export type Table = DataTable | LayerTable;

export function isLayerTable(table: Table): table is LayerTable {
  return table.type !== undefined;
}

export function isCollectionLayerTable(table: Table): table is CollectionLayerTable {
  return table.type !== undefined && table.source !== 'geotiff';
}

export function isOsmTable(table: Table): table is OsmTable {
  return table.source === 'osm' && table.type === undefined;
}

export function isGeotiffTable(table: Table): table is GeotiffTable {
  return table.source === 'geotiff';
}

export function isVectorLayerTable(table: Table): table is Exclude<CollectionLayerTable, GridTable> {
  return table.type !== undefined && table.type !== 'raster';
}
