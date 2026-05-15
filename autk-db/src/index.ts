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
export type { LayerType, BoundingBox } from './types-core';

export {
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_INPUT_COORDINATE_FORMAT,
  DEFAULT_WORKSPACE_COORDINATE_FORMAT,
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
} from './interfaces';

export {
  isRenderableTable,
  isVectorTable,
  isRasterTable,
} from './interfaces';

export type { Layer, LoadLayerParams } from './use-cases/load-layer';
export type { LoadGeoTiffParams } from './use-cases/load-geotiff';
export type { GetTableDataParams, GetTableDataOutput } from './use-cases/get-table-data';
export type {
  LoadingPhase,
  OnLoadingProgress,
  OsmLoadTimings,
  LayerLoadTimings,
  LoadOsmParams,
} from './use-cases/load-osm-from-overpass-api';
export type { SpatialQueryParams, AggregateFunction } from './use-cases/spatial-join';
export type { BuildHeatmapParams, HeatmapAggregateFunction } from './use-cases/build-heatmap';
export type { LoadCsvParams } from './use-cases/load-csv';
export type { LoadCustomLayerParams } from './use-cases/load-custom-layer';
export type { LoadGridLayerParams } from './use-cases/load-grid-layer';
export type { LoadJsonParams } from './use-cases/load-json';
export type { RawQueryParams, RawQueryOutput } from './use-cases/raw-query';
export type { UpdateTableParams, UpdateStrategy } from './use-cases/update-table';

export * from './db';
