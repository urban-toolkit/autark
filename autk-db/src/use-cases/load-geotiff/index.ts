/**
 * Loads GeoTIFF raster files into DuckDB and exposes raster band metadata.
 *
 * This entrypoint re-exports the GeoTIFF loading use case and its configuration.
 *
 * @module load-geotiff
 */
export { LoadGeoTiffUseCase } from './use-case';
export type { LoadGeoTiffParams } from './interfaces';
