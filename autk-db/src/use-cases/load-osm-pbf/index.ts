/**
 * Load OSM data from PBF files into DuckDB tables.
 *
 * Provides the PBF ingestion use case which resolves nodes/ways/relations and
 * inserts normalized records suitable for spatial analysis.
 *
 * @module load-osm-pbf
 */
export { LoadOsmFromPbfUseCase } from './use-case';
