/**
 * Utilities for loading OSM-derived layers into DuckDB.
 *
 * Re-exports the OSM layer loading use case and its types so callers can import a stable API.
 *
 * @module load-osm-layer
 */
export * from './use-case';
export type { LoadOsmLayerParams, Layer } from './interfaces';
