/**
 * Public entry point for the `@urban-toolkit/autk-db` package.
 *
 * Re-exports the database class, shared table metadata types, loading parameter types, and OSM-related constants from a single module.
 *
 * @module AutkDb
 * @example
 * import { AutkDb, isVectorTable, DEFAULT_WORKSPACE_NAME } from '@urban-toolkit/autk-db';
 *
 * const db = new AutkDb();
 * console.log(DEFAULT_WORKSPACE_NAME); // 'autk'
 * console.log(isVectorTable({ source: 'geojson', name: 'roads', columns: [], type: 'line' })); // true
 */
export {
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_INPUT_COORDINATE_FORMAT,
  DEFAULT_WORKSPACE_COORDINATE_FORMAT,
  DEFAULT_WORKSPACE_PRECISION_GRID,
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_ROADS_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './consts';

export type {
  TableSource,
  Table,
  BaseTable,
  RasterBandMetadata,
  UserTable,
  OsmTable,
  OsmLayerTable,
  GeojsonTable,
  CsvTable,
  JsonTable,
  GeotiffTable,
  Column,
  WorkspaceConfiguration,
} from './interfaces';

export {
  isRenderableTable,
  isVectorTable,
  isRasterTable,
} from './interfaces';

export type { LoadGeoTiffParams } from './use-cases/load-geotiff';
export type { GetTableOutput } from './use-cases/get-table';
export type { GetLayerOptions } from './use-cases/get-layer';
export type {
  LoadingPhase,
  OnLoadingProgress,
  OsmLoadTimings,
  LayerLoadTimings,
  LoadOsmParams,
  OsmQueryArea,
  OsmNamedArea,
  OsmBoundingBoxArea,
  OsmTagSet,
  OsmTagFilter,
} from './use-cases/load-osm-overpass';
export { isBoundingBoxArea } from './use-cases/load-osm-overpass';
export type { SpatialQueryParams, AggregateFunction, NearConfig } from './use-cases/spatial-join';
export type { BuildHeatmapParams, HeatmapAggregateFunction, HeatmapGroupBy } from './use-cases/build-heatmap';
export type {
  CsvDefaultLatLngGeometryColumns,
  CsvLatLngGeometryColumns,
  CsvWktGeometryColumns,
  CsvGeometryColumns,
  CsvGeometryLayerType,
  LoadCsvParams,
} from './use-cases/load-csv';
export type { LoadGeojsonParams } from './use-cases/load-geojson';
export type {
  JsonDefaultLatLngGeometryColumns,
  JsonLatLngGeometryColumns,
  JsonWktGeometryColumns,
  JsonGeometryColumns,
  JsonGeometryLayerType,
  LoadJsonParams,
} from './use-cases/load-json';
export type { RawQueryParams, RawQueryOutput } from './use-cases/raw-query';
export type { UpdateTableParams, UpdateStrategy } from './use-cases/update-table';

export * from './db';
