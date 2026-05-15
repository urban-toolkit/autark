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

export type Table = OsmTable | OsmLayerTable | CsvTable | JsonTable | GeojsonTable | GridTable | GeotiffTable | SqlTable;

export interface OsmTable {
  source: 'osm';
  type: 'pointset';
  name: string;
  columns: Column[];
}

export interface OsmLayerTable {
  source: 'osm';
  type: LayerType;
  name: string;
  columns: Column[];
}

export interface GeojsonTable {
  source: 'geojson';
  type: LayerType;
  name: string;
  columns: Column[];
}

export interface CsvTable {
  source: 'csv';
  type: 'pointset';
  name: string;
  columns: Column[];
}

export interface JsonTable {
  source: 'json';
  type: 'pointset';
  name: string;
  columns: Column[];
}

export interface GridTable {
  source: 'user';
  type: LayerType;
  name: string;
  columns: Column[];
}

export interface GeotiffTable {
  source: 'geotiff';
  type: 'raster';
  name: string;
  columns: Column[];
}

export interface SqlTable {
  source: 'user';
  type: 'pointset';
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
}
