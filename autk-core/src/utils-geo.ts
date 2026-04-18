import { FeatureCollection, Geometry } from 'geojson';

import type { BoundingBox, LayerType } from './types-layer';

/**
 * Computes the central origin of a GeoJSON FeatureCollection.
 */
export function computeOrigin(geojson: FeatureCollection): [number, number] {
    const bbox = computeBoundingBox(geojson);
    if (!bbox) return [0, 0];
    return [
        (bbox.minLon + bbox.maxLon) * 0.5,
        (bbox.minLat + bbox.maxLat) * 0.5,
    ];
}

/**
 * Computes the bounding box of a GeoJSON feature collection or geometry.
 */
export function computeBoundingBox(source: FeatureCollection | Geometry | null): BoundingBox | null {
    if (!source) {
        return null;
    }

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;

    const expand = (coord: number[]) => {
        if (coord[0] < minLon) minLon = coord[0];
        if (coord[0] > maxLon) maxLon = coord[0];
        if (coord[1] < minLat) minLat = coord[1];
        if (coord[1] > maxLat) maxLat = coord[1];
    };

    if (source.type === 'FeatureCollection') {
        for (const feature of source.features) {
            const geom = feature.geometry;
            if (!geom) continue;
            expandGeometry(geom, expand);
        }
    } else {
        expandGeometry(source, expand);
    }

    if (!Number.isFinite(minLon)) {
        return null;
    }

    return { minLon, minLat, maxLon, maxLat };
}

/**
 * Returns true when the string matches one of the shared layer types.
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
 * Maps a GeoJSON geometry type to the toolkit layer taxonomy.
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

function expandGeometry(geom: Geometry, expand: (c: number[]) => void): void {
    switch (geom.type) {
        case 'Point':
            expand(geom.coordinates);
            break;
        case 'MultiPoint':
        case 'LineString':
            for (const c of geom.coordinates) expand(c);
            break;
        case 'MultiLineString':
            for (const line of geom.coordinates) {
                for (const c of line) expand(c);
            }
            break;
        case 'Polygon':
            for (const ring of geom.coordinates) {
                for (const c of ring) expand(c);
            }
            break;
        case 'MultiPolygon':
            for (const poly of geom.coordinates) {
                for (const ring of poly) {
                    for (const c of ring) expand(c);
                }
            }
            break;
        case 'GeometryCollection':
            for (const sub of geom.geometries) expandGeometry(sub, expand);
            break;
    }
}


//------------------------------------------------------------------



/**
 * Builds a closed polygon that represents a planar offset of a polyline.
 *
 * Input coordinates are expected to already be in a local planar system
 * (for example, shifted projected meters). The returned polygon is suitable
 * for triangulation with earcut.
 */
export function offsetPolyline(points: number[][], distance: number): [number, number][] {
    const clean = points.filter((point, index) => {
        if (index === 0) return true;
        const prev = points[index - 1];
        return point[0] !== prev[0] || point[1] !== prev[1];
    }) as [number, number][];

    if (clean.length < 2 || distance === 0) {
        return [];
    }

    const left: [number, number][] = [];
    const right: [number, number][] = [];

    for (let i = 0; i < clean.length; i++) {
        const prev = i > 0 ? clean[i - 1] : null;
        const curr = clean[i];
        const next = i < clean.length - 1 ? clean[i + 1] : null;

        const prevNormal = prev ? getUnitLeftNormal(prev, curr) : null;
        const nextNormal = next ? getUnitLeftNormal(curr, next) : null;

        const leftPoint = computeOffsetPoint(prev, curr, next, prevNormal, nextNormal, distance, 1);
        const rightPoint = computeOffsetPoint(prev, curr, next, prevNormal, nextNormal, distance, -1);

        left.push(leftPoint);
        right.push(rightPoint);
    }

    const polygon = [...left, ...right.reverse()];
    if (polygon.length > 0) {
        polygon.push([polygon[0][0], polygon[0][1]]);
    }

    return polygon;
}

function getUnitLeftNormal(a: [number, number], b: [number, number]): [number, number] | null {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);

    if (length === 0) {
        return null;
    }

    return [-dy / length, dx / length];
}

function computeOffsetPoint(
    prev: [number, number] | null,
    curr: [number, number],
    next: [number, number] | null,
    prevNormal: [number, number] | null,
    nextNormal: [number, number] | null,
    distance: number,
    side: 1 | -1,
): [number, number] {
    if (!prevNormal && !nextNormal) {
        return curr;
    }

    if (!prev || !prevNormal) {
        return [
            curr[0] + nextNormal![0] * distance * side,
            curr[1] + nextNormal![1] * distance * side,
        ];
    }

    if (!next || !nextNormal) {
        return [
            curr[0] + prevNormal[0] * distance * side,
            curr[1] + prevNormal[1] * distance * side,
        ];
    }

    const prevOffsetA: [number, number] = [
        prev[0] + prevNormal[0] * distance * side,
        prev[1] + prevNormal[1] * distance * side,
    ];
    const prevOffsetB: [number, number] = [
        curr[0] + prevNormal[0] * distance * side,
        curr[1] + prevNormal[1] * distance * side,
    ];
    const nextOffsetA: [number, number] = [
        curr[0] + nextNormal[0] * distance * side,
        curr[1] + nextNormal[1] * distance * side,
    ];
    const nextOffsetB: [number, number] = [
        next[0] + nextNormal[0] * distance * side,
        next[1] + nextNormal[1] * distance * side,
    ];

    const intersection = intersectLines(prevOffsetA, prevOffsetB, nextOffsetA, nextOffsetB);
    if (intersection) {
        return intersection;
    }

    const avgX = prevNormal[0] + nextNormal[0];
    const avgY = prevNormal[1] + nextNormal[1];
    const avgLength = Math.hypot(avgX, avgY);

    if (avgLength === 0) {
        return [
            curr[0] + nextNormal[0] * distance * side,
            curr[1] + nextNormal[1] * distance * side,
        ];
    }

    return [
        curr[0] + (avgX / avgLength) * distance * side,
        curr[1] + (avgY / avgLength) * distance * side,
    ];
}

function intersectLines(
    a1: [number, number],
    a2: [number, number],
    b1: [number, number],
    b2: [number, number],
): [number, number] | null {
    const x1 = a1[0];
    const y1 = a1[1];
    const x2 = a2[0];
    const y2 = a2[1];
    const x3 = b1[0];
    const y3 = b1[1];
    const x4 = b2[0];
    const y4 = b2[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) {
        return null;
    }

    const detA = x1 * y2 - y1 * x2;
    const detB = x3 * y4 - y3 * x4;

    return [
        (detA * (x3 - x4) - (x1 - x2) * detB) / denom,
        (detA * (y3 - y4) - (y1 - y2) * detB) / denom,
    ];
}
