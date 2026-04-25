/**
 * @module LayerUtils
 * Shared helpers for the toolkit's layer taxonomy.
 *
 * This module centralizes the canonical `LayerType` guard and the GeoJSON
 * geometry classification used by layer-loading code. It keeps layer identity
 * checks and geometry-to-layer inference consistent across packages that share
 * the same taxonomy.
 */
import type { Geometry } from 'geojson';

import type { LayerType } from './types-layer';

/**
 * Checks whether a string is a supported shared layer type.
 *
 * This guard matches the taxonomy used by the core layer-loading helpers. It
 * accepts the fixed set of public layer identifiers and rejects all other
 * strings.
 *
 * @param value Candidate layer identifier to validate.
 * @returns `true` when `value` is one of the supported shared `LayerType` values,
 * otherwise `false`.
 */
export function isLayerType(value: string): value is LayerType {
    return value === 'surface'
        || value === 'water'
        || value === 'parks'
        || value === 'roads'
        || value === 'buildings'
        || value === 'points'
        || value === 'polygons'
        || value === 'polylines'
        || value === 'raster';
}

/**
 * Maps a GeoJSON geometry type to the corresponding shared layer family.
 *
 * Classification is based only on the GeoJSON `type` value. Point geometries
 * map to `points`, line geometries map to `polylines`, and polygonal as well
 * as `GeometryCollection` inputs map to `polygons`.
 *
 * @param geometryType GeoJSON geometry type to classify.
 * @returns The shared layer family used by the toolkit for that geometry type:
 * `points` for point geometries, `polylines` for line geometries, and `polygons`
 * for polygonal or collection geometries.
 */
export function mapGeometryTypeToLayerType(
    geometryType: Geometry['type'],
): Extract<LayerType, 'points' | 'polygons' | 'polylines'> {
    switch (geometryType) {
        case 'Point':
        case 'MultiPoint':
            return 'points';
        case 'LineString':
        case 'MultiLineString':
            return 'polylines';
        case 'Polygon':
        case 'MultiPolygon':
        case 'GeometryCollection':
            return 'polygons';
    }
}
