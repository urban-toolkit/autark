/**
 * Use case for loading JSON data into DuckDB with optional spatial geometry creation.
 *
 * Supports loading from a remote URL or an in-memory array, and can derive point geometry from lat/lng columns or from WKT text.
 *
 * @module load-json
 */
export * from './use-case';
export type {
  JsonDefaultLatLngGeometryColumns,
  JsonLatLngGeometryColumns,
  JsonWktGeometryColumns,
  JsonGeometryColumns,
  JsonGeometryLayerType,
  LoadJsonParams,
} from './interfaces';
