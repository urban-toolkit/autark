/**
 * @module LayerTypes
 * Shared layer-taxonomy and geographic-bounds types used across the toolkit.
 *
 * This module centralizes the layer families understood by collection loading,
 * rendering selection, and downstream styling logic. It also defines the named
 * coordinate form used by GeoJSON utilities when they return geographic bounds.
 */

/**
 * Canonical layer families recognized by collection loading and rendering.
 *
 * `LayerType` is used to route GeoJSON and other layer sources into the
 * appropriate pipeline branch, including geometry inference, renderer
 * selection, and thematic handling.
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
 * Named geographic bounding box returned by GeoJSON utility helpers.
 *
 * The fields preserve the coordinate order used throughout the toolkit while
 * giving each bound an explicit longitude/latitude name.
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
