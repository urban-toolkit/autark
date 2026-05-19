import type { LayerType } from '../../types-core';

/**
 * Enables point geometry creation from the default `Latitude` and `Longitude` JSON fields.
 *
 * Set to `true` to use the shorthand mode where latitude and longitude columns are named `Latitude` and `Longitude`.
 *
 * @example
 * const columns: JsonDefaultLatLngGeometryColumns = true;
 */
export type JsonDefaultLatLngGeometryColumns = true;

/**
 * Describes how to build point geometry from explicit latitude and longitude JSON fields.
 *
 * @example
 * const columns: JsonLatLngGeometryColumns = { latColumnName: 'lat', longColumnName: 'lng' };
 */
export interface JsonLatLngGeometryColumns {
  /** Name of the field that stores latitude values used to create point geometries. */
  latColumnName: string;
  /** Name of the field that stores longitude values used to create point geometries. */
  longColumnName: string;
  /** CRS of the source coordinate fields before they are transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Describes how to build geometry from a single WKT JSON field.
 *
 * @example
 * const columns: JsonWktGeometryColumns = { wktColumnName: 'geom' };
 */
export interface JsonWktGeometryColumns {
  /** Name of the field that stores WKT geometry text such as `POINT(...)` or `POLYGON(...)`. */
  wktColumnName: string;
  /** CRS of the source WKT geometry before it is transformed into the workspace CRS. */
  coordinateFormat?: string;
}

/**
 * Lists the supported ways to derive geometry while loading a JSON file.
 *
 * Use `true` for default lat/lng columns, provide a `JsonLatLngGeometryColumns` object for custom column names, or a `JsonWktGeometryColumns` object for WKT-based geometry.
 *
 * @example
 * const geo: JsonGeometryColumns = true; // uses default Latitude/Longitude fields
 * const geoWkt: JsonGeometryColumns = { wktColumnName: 'shape' };
 */
export type JsonGeometryColumns =
  | JsonDefaultLatLngGeometryColumns
  | JsonLatLngGeometryColumns
  | JsonWktGeometryColumns;

/**
 * Restricts JSON-derived geometry to vector layer families supported by the database.
 *
 * Only `points`, `polylines`, and `polygons` are valid layer types for JSON data sources.
 */
export type JsonGeometryLayerType = Extract<LayerType, 'points' | 'polylines' | 'polygons'>;

/**
 * Describes the inputs required to load JSON data into DuckDB.
 *
 * Provide either `jsonFileUrl` or `jsonObject` — not both. The `geometryColumns` field is optional and controls spatial column creation.
 *
 * @example
 * const params: LoadJsonParams = { jsonFileUrl: 'data.json', outputTableName: 'my_table' };
 * const paramsGeo: LoadJsonParams = { jsonObject: data, outputTableName: 'geo_table', geometryColumns: true };
 */
export interface LoadJsonParams {
  /** URL of the JSON file to fetch and load into DuckDB. */
  jsonFileUrl?: string;
  /** In-memory JSON array to serialize and load. */
  jsonObject?: unknown[];
  /** Name of the output table created inside the target workspace. */
  outputTableName: string;
  /** Optional geometry strategy used to create a spatial column while loading. */
  geometryColumns?: JsonGeometryColumns;
  /** Optional workspace override used by higher-level callers when qualifying the table name. */
  workspace?: string;
}
