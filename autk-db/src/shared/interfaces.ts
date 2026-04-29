import { LayerType, BoundingBox } from 'autk-core';

export type { BoundingBox };
export {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_HIGHWAY_VALUES as EXCLUDED_ROAD_HIGHWAY_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './osm-tag-definitions';

export type GridLayerTable = CommonTable & { source: 'user'; type: LayerType };
export type GeoTiffTable   = CommonTable & { source: 'geotiff'; type: 'raster' };

export type Table = OsmTable | LayerTable | CsvTable | JsonTable | CustomLayerTable | GridLayerTable | GeoTiffTable | AnyTable;

export type OsmTable = CommonTable & { source: 'osm'; type: 'pointset' }; // TODO: which type?
export type LayerTable = CommonTable & { source: 'osm'; type: LayerType };
export type CustomLayerTable = CommonTable & { source: 'geojson'; type: LayerType };
export type CsvTable = CommonTable & { source: 'csv'; type: 'pointset' }; // TODO: in theory, its optional to be a pointset
export type JsonTable = CommonTable & { source: 'json'; type: 'pointset' };
export type AnyTable = CommonTable & { source: 'user'; type: 'pointset' };

export interface CommonTable {
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
}
