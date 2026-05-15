export interface LoadGeoTiffParams {
  /** URL of the GeoTIFF file to fetch and load. */
  geotiffFileUrl?: string;
  /** Raw ArrayBuffer of an already-fetched GeoTIFF file. */
  geotiffArrayBuffer?: ArrayBuffer;
  /** Name of the output DuckDB table. */
  outputTableName: string;
  /**
   * CRS of the input GeoTIFF file (source). Defaults to EPSG:4326.
   * The geometry will be transformed from this CRS to the workspace CRS.
   */
  coordinateFormat?: string;
  /**
   * Maximum number of pixels to load. Defaults to 500 000.
   * An error is thrown if the full raster exceeds this limit.
   */
  maxPixels?: number;
  workspace?: string;
}
