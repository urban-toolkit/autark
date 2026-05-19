/**
 * Loads OSM data via the Overpass API and stores it in DuckDB tables.
 *
 * Handles downloading, processing (splitting boundaries, deriving layers), and inserting OSM elements.
 *
 * @module load-osm-overpass
 */
export * from './use-case';
export type { LoadOsmParams, LoadingPhase, OnLoadingProgress, OsmLoadTimings, LayerLoadTimings } from './interfaces';
