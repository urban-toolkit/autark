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
  | 'background'
  | 'surface'
  | 'parks'
  | 'water'
  | 'roads'
  | 'buildings'
  | 'points'
  | 'polygons'
  | 'polylines'
  | 'raster';

/** All `LayerType` values as a readonly array, in union definition order. */
export const LAYER_TYPE_VALUES: readonly LayerType[] = [
  'background',
  'surface',
  'parks',
  'water',
  'roads',
  'buildings',
  'points',
  'polygons',
  'polylines',
  'raster',
] as const;

/**
 * OSM base layer types in fixed bottom-up render order.
 *
 * Buildings are always rendered last and are not included here.
 * This order is independent of the `LayerType` union definition order.
 */
export const OSM_BASE_LAYER_ORDER: readonly LayerType[] = [
  'surface',
  'parks',
  'water',
  'roads',
  'buildings'
] as const;

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
