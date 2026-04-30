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
 * Type guard checking whether a string is a supported shared layer type.
 *
 * @param value Candidate layer identifier to validate.
 * @returns `true` when `value` is a recognized `LayerType`, narrowing the type.
 * @throws Never throws.
 * @example
 * if (isLayerType(userInput)) {
 *   // userInput is now typed as LayerType
 * }
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
 * @param geometryType GeoJSON geometry type to classify.
 * @returns One of `points`, `polylines`, or `polygons`.
 * @throws Never throws.
 * @example
 * mapGeometryTypeToLayerType('Polygon');  // 'polygons'
 * mapGeometryTypeToLayerType('Point');    // 'points'
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
