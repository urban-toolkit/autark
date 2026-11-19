import type { ColorMapDomainStrategy, CustomColorPalette } from '@urban-toolkit/autk-core';

/** Source colors paired with their category names in matching order. */
export type CategoricalRgbPalette = CustomColorPalette & {
  type: 'categorical';
  domainSpec: { type: ColorMapDomainStrategy.USER; params: string[] };
  interpolator?: never;
};

export interface LoadGeoTiffParams {
  /** URL of the GeoTIFF file to fetch and load. */
  geotiffFileUrl?: string;
  /** Raw ArrayBuffer of an already-fetched GeoTIFF file. */
  geotiffArrayBuffer?: ArrayBuffer;
  /** Name of the output DuckDB table. */
  outputTableName: string;
  /**
   * CRS of the input GeoTIFF file (source).
   *
   * Defaults to `EPSG:4326` (lat/lng) when omitted.
   * The raster extent metadata will be transformed from this CRS to the workspace CRS.
   * If the raster is not in `EPSG:4326`, pass the correct CRS explicitly.
   */
  coordinateFormat?: string;
  /**
   * Maximum number of raster cells to decode into memory.
   * Larger rasters are downsampled to fit this limit.
   * Defaults to 1 000 000.
   */
  maxRasterCells?: number;
  /**
   * Deprecated alias for `maxRasterCells`.
   */
  maxPixels?: number;
  /**
   * Resampling method used when downsampling large rasters.
   * Defaults to `'bilinear'`. Categorical RGB imports always use nearest-neighbor.
   */
  resampleMethod?: 'nearest' | 'bilinear';
  /** Decode a three-band RGB GeoTIFF into one scalar band of named classes. */
  categoricalRgb?: CategoricalRgbPalette;
  workspace?: string;
}
