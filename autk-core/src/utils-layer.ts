/**
 * @module LayerUtils
 * Shared helpers for the toolkit's layer taxonomy.
 *
 * This module centralizes GeoJSON geometry classification used by layer-loading
 * code. It keeps geometry-to-layer inference consistent across packages that
 * share the same taxonomy.
 */
import type { Geometry } from 'geojson';

import type { LayerType } from './types-layer';

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
