/**
 * @module LayerTypes
 * Shared layer-taxonomy and geographic-bounds types used across the toolkit.
 *
 * These types define the common layer families recognized by Autark modules
 * and the named bounding-box structure returned by GeoJSON utility helpers.
 */

/**
 * Layer types supported across the Autark toolkit.
 */
export type LayerType =
  | 'surface'
  | 'water'
  | 'parks'
  | 'roads'
  | 'buildings'
  | 'points'
  | 'polygons'
  | 'polylines'
  | 'raster';

/**
 * Geographic bounding box with named coordinate fields.
 */
export interface BoundingBox {
  /** Minimum longitude contained in the bounds. */
  minLon: number;
  /** Minimum latitude contained in the bounds. */
  minLat: number;
  /** Maximum longitude contained in the bounds. */
  maxLon: number;
  /** Maximum latitude contained in the bounds. */
  maxLat: number;
}
