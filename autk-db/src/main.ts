/**
 * @module AutkDb
 * Public entry point for the `autk-db` package.
 *
 * Re-exports the spatial database class, table types, and OSM tag definitions.
 */
export type { LayerType, BoundingBox } from 'autk-core';
export {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_HIGHWAY_VALUES as EXCLUDED_ROAD_HIGHWAY_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './shared/osm-tag-definitions';
export type { Layer, LoadLayerParams } from './spatial/use-cases/load-layer/interfaces';
export type { LoadGeoTiffParams } from './spatial/use-cases/load-geotiff';
export type { CommonTable, Table, OsmTable, LayerTable, CustomLayerTable, CsvTable, JsonTable, AnyTable, GridLayerTable, GeoTiffTable, Column } from './shared/interfaces';
export type { GetTableDataParams, GetTableDataOutput } from './spatial/use-cases/get-table-data';
export type { LoadingPhase, OnLoadingProgress, OsmLoadTimings, LayerLoadTimings, LoadOsmParams } from './spatial/use-cases/load-osm-from-overpass-api/interfaces';
export type { SpatialQueryParams, AggregateFunction } from './spatial/use-cases/spatial-join/interfaces';
export type { BuildHeatmapParams, HeatmapAggregateFunction } from './spatial/use-cases/build-heatmap/interfaces';
export type { LoadCsvParams } from './spatial/use-cases/load-csv/interfaces';
export type { LoadCustomLayerParams } from './spatial/use-cases/load-custom-layer/interfaces';
export type { LoadGridLayerParams } from './spatial/use-cases/load-grid-layer/LoadGridLayerUseCase';
export type { LoadJsonParams } from './spatial/use-cases/load-json/interfaces';
export type { RawQueryParams, RawQueryOutput } from './spatial/use-cases/raw-query/interfaces';
export type { UpdateTableParams, UpdateStrategy } from './spatial/use-cases/update-table/interfaces';
export * from './spatial';
