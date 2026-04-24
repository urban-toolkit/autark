/**
 * @module LayerUtils
 * Shared helpers for working with the toolkit's layer taxonomy.
 * Includes validation of layer identifiers and mapping from GeoJSON geometry
 * families to the corresponding `LayerType` categories.
 */
import type { Geometry } from 'geojson';

import type { LayerType } from './types-layer';

/**
 * Returns true when the string matches one of the shared layer types.
 *
 * @param value - Candidate layer identifier to validate.
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
 * Maps a GeoJSON geometry type to the corresponding toolkit layer family.
 *
 * @param geometryType - GeoJSON geometry type to classify.
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
