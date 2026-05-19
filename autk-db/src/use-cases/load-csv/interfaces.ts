import type { LayerType } from '../../types-core';

/**
 * Enables point geometry creation from the default `Latitude` and `Longitude` CSV columns.
 *
 * This shorthand covers the common case where input files already follow the expected column naming convention.
 *
 * @example
 * const geometryColumns: CsvDefaultLatLngGeometryColumns = true;
 */
export type CsvDefaultLatLngGeometryColumns = true;

/**
 * Describes how to build point geometry from explicit latitude and longitude columns.
 *
 * Use this shape when coordinate values exist in custom columns or arrive in a CRS that must be transformed.
 *
 * @example
 * const geometryColumns: CsvLatLngGeometryColumns = {
 *   latColumnName: 'lat',
 *   longColumnName: 'lng',
 *   coordinateFormat: 'EPSG:4326',
 * };
 */
export interface CsvLatLngGeometryColumns {
  /** Name of the column that stores latitude values used to create point geometries. */
  latColumnName: string;
  /** Name of the column that stores longitude values used to create point geometries. */
  longColumnName: string;
  /** CRS of the source coordinate columns before they are transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Describes how to build geometry from a single WKT column.
 *
 * The resulting layer family is inferred after the WKT text is parsed into DuckDB spatial geometries.
 *
 * @example
 * const geometryColumns: CsvWktGeometryColumns = {
 *   wktColumnName: 'geometry_wkt',
 *   coordinateFormat: 'EPSG:3857',
 * };
 */
export interface CsvWktGeometryColumns {
  /** Name of the column that stores WKT geometry text such as `POINT(...)` or `POLYGON(...)`. */
  wktColumnName: string;
  /** CRS of the source WKT geometry before it is transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Lists the supported ways to derive geometry while loading a CSV file.
 *
 * Use `true` for the default `Latitude` and `Longitude` columns, or pass an object to use custom coordinate or WKT columns.
 *
 * @example
 * const geometryColumns: CsvGeometryColumns = {
 *   latColumnName: 'y',
 *   longColumnName: 'x',
 * };
 */
export type CsvGeometryColumns =
  | CsvDefaultLatLngGeometryColumns
  | CsvLatLngGeometryColumns
  | CsvWktGeometryColumns;

/**
 * Describes the inputs required to load CSV data into DuckDB.
 *
 * Callers can provide either a remote CSV file URL or an in-memory CSV matrix, with optional geometry creation rules.
 *
 * @example
 * const params: LoadCsvParams = {
 *   csvFileUrl: 'https://example.com/parcels.csv',
 *   outputTableName: 'parcels',
 *   geometryColumns: { wktColumnName: 'wkt' },
 * };
 */
export interface LoadCsvParams {
  /** URL of the CSV file to fetch and load into DuckDB. */
  csvFileUrl?: string;
  /** In-memory CSV rows to serialize, including the header row as the first entry. */
  csvObject?: unknown[][];
  /** Name of the output table created inside the target workspace. */
  outputTableName: string;
  /** Field delimiter used by the CSV source. Defaults to `,` in the use case. */
  delimiter?: string;
  /** Optional geometry strategy used to create a spatial column while loading. */
  geometryColumns?: CsvGeometryColumns;
  /** Optional workspace override used by higher-level callers when qualifying the table name. */
  workspace?: string;
}

/**
 * Restricts CSV-derived geometry to vector layer families supported by the database.
 *
 * CSV imports can only produce point, polyline, or polygon layers because raster outputs are not inferred from tabular rows.
 *
 * @example
 * const layerType: CsvGeometryLayerType = 'points';
 */
export type CsvGeometryLayerType = Extract<LayerType, 'points' | 'polylines' | 'polygons'>;
