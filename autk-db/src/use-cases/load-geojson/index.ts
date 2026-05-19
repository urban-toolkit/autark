/**
 * Loads GeoJSON FeatureCollections into DuckDB as spatial layer tables.
 *
 * This module exposes the use case that registers GeoJSON files or objects
 * into the DuckDB VFS, converts them into typed layer tables, and returns metadata.
 *
 * @module load-geojson
 */
export * from './use-case';
export type { LoadGeojsonParams } from './interfaces';
