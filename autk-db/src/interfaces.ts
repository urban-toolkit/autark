import type { BoundingBox, LayerType } from './types-core';

export {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_ROADS_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from './consts';

/**
 * Supported origins for tables registered in the database workspace.
 *
 * Distinguishes built-in loaders from user-provided tables so callers can branch on import behavior.
 */
export type TableSource = 'osm' | 'geojson' | 'csv' | 'json' | 'geotiff' | 'user';

/**
 * Describes a single table column as reported by DuckDB.
 *
 * Keeps schema metadata small and stable for UI rendering and query planning.
 */
export interface Column {
  /** Stable column name used in queries and result objects. */
  name: string;
  /** Database type string returned for the column. */
  type: string;
}

/**
 * Metadata for one raster band exposed by a GeoTIFF-backed table.
 *
 * Used by raster-aware consumers to present labels and target individual bands.
 */
export interface RasterBandMetadata {
  /** Internal band identifier used by raster operations. */
  id: string;
  /** Human-readable label shown in UI controls and outputs. */
  label: string;
}

/**
 * Shared metadata stored for every table tracked by the workspace.
 *
 * Provides the common contract used by all table variants regardless of source or geometry support.
 */
export interface BaseTable {
  /** Declares how the table entered the database. */
  source: TableSource;
  /** Unique table name within the active workspace. */
  name: string;
  /** Flat schema information returned by DuckDB. */
  columns: Column[];
  /** Optional raster band metadata when the table stores raster data. */
  bands?: RasterBandMetadata[];
}

/**
 * Raw OSM import that has not yet been materialized as a renderable layer.
 *
 * Represents the unclassified OSM staging table created before layer extraction.
 */
export interface OsmTable extends BaseTable {
  /** Marks the table as originating from the OSM loader. */
  source: 'osm';
  /** Stays undefined until the raw import is converted into a layer table. */
  type?: undefined;
}

/**
 * OSM-derived layer with an explicit geometry type for rendering and queries.
 *
 * Used after OSM data has been classified into a concrete map layer.
 */
export interface OsmLayerTable extends BaseTable {
  /** Marks the table as originating from the OSM loader. */
  source: 'osm';
  /** Geometry category used for rendering, styling, and spatial operations. */
  type: LayerType;
}

/**
 * GeoJSON import with a known layer type inferred during loading.
 *
 * Allows downstream code to treat loaded GeoJSON as a renderable layer immediately.
 */
export interface GeojsonTable extends BaseTable {
  /** Marks the table as originating from the GeoJSON loader. */
  source: 'geojson';
  /** Geometry category inferred from the imported GeoJSON features. */
  type: LayerType;
}

/**
 * CSV table without geometry metadata.
 *
 * Represents plain tabular data loaded from comma-separated values.
 */
export interface CsvTable extends BaseTable {
  /** Marks the table as originating from the CSV loader. */
  source: 'csv';
  /** Remains undefined because CSV imports are not renderable by default. */
  type?: undefined;
}

/**
 * JSON table without renderable geometry metadata.
 *
 * Represents generic JSON records that are queryable but not map-renderable by default.
 */
export interface JsonTable extends BaseTable {
  /** Marks the table as originating from the JSON loader. */
  source: 'json';
  /** Remains undefined because generic JSON imports do not imply a layer type. */
  type?: undefined;
}

/**
 * GeoTIFF-backed raster table.
 *
 * Identifies tables whose data should be treated as raster imagery rather than vector geometry.
 */
export interface GeotiffTable extends BaseTable {
  /** Marks the table as originating from the GeoTIFF loader. */
  source: 'geotiff';
  /** Fixed raster layer kind used by raster-specific rendering paths. */
  type: 'raster';
}

/**
 * User-provided table that may be plain tabular data or an explicit layer.
 *
 * Supports custom tables that can optionally declare their own renderable layer type.
 */
export interface UserTable extends BaseTable {
  /** Marks the table as supplied directly by user code. */
  source: 'user';
  /** Optional layer kind when the user table should participate in rendering. */
  type?: LayerType;
}

/**
 * All table metadata variants that can be stored in an `AutkDb` workspace.
 *
 * Serves as the main discriminated union for branching on table source and renderability.
 */
export type Table = OsmTable | OsmLayerTable | CsvTable | JsonTable | GeojsonTable | GeotiffTable | UserTable;

/**
 * Workspace-local state cached by `AutkDb` for one schema.
 *
 * Groups the registered tables, target CRS, and cached extents associated with a workspace.
 */
export interface WorkspaceData {
  /** Table metadata currently registered for the workspace schema. */
  tables: Array<Table>;
  /** Target coordinate reference system used for stored geometries. */
  coordinateFormat: string;
  /** Cached bounding box covering all known workspace layer geometries. */
  workspaceBoundingBox?: BoundingBox;
  /** Cached OSM query extent for the workspace when OSM data has been loaded. */
  osmBoundingBox?: BoundingBox;
}

/**
 * Narrows a table to metadata that can be rendered on a map.
 *
 * Use this guard before accessing `table.type` in visualization code.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table has a defined renderable `type`.
 * @throws Never throws.
 * @example
 * const renderable = tables.filter(isRenderableTable);
 * console.log(renderable[0]?.type); // 'point', 'polygon', 'line', or 'raster'
 */
export function isRenderableTable(table: Table): table is Table & { type: LayerType } {
  return table.type !== undefined;
}

/**
 * Narrows a table to vector geometry layers.
 *
 * Excludes raw OSM tables, plain tabular imports, and raster tables.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table has a non-raster layer `type`.
 * @throws Never throws.
 * @example
 * const vectorTables = tables.filter(isVectorTable);
 * console.log(vectorTables.every((table) => table.type !== 'raster')); // true
 */
export function isVectorTable(
  table: Table,
): table is OsmLayerTable | GeojsonTable | (UserTable & { type: Exclude<LayerType, 'raster'> }) {
  return table.type !== undefined && table.type !== 'raster';
}

/**
 * Narrows a table to raster-backed layers.
 *
 * Use this guard before reading raster band metadata or raster-specific options.
 *
 * @param table - Table metadata to inspect.
 * @returns `true` when the table represents raster data.
 * @throws Never throws.
 * @example
 * const rasterTables = tables.filter(isRasterTable);
 * console.log(rasterTables[0]?.bands?.map((band) => band.label)); // ['Band 1']
 */
export function isRasterTable(
  table: Table,
): table is GeotiffTable | (UserTable & { type: 'raster' }) {
  return table.type === 'raster';
}
