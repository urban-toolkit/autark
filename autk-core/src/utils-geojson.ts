/**
 * @module GeoJsonUtils
 * GeoJSON-focused utility functions for deriving spatial metadata from feature
 * collections and geometries.
 * Includes helpers for bounding boxes, collection origins, and
 * geometry-aware centroids.
 */
import { 
    FeatureCollection, 
    Geometry, 
    Position 
} from 'geojson';

import type { BoundingBox } from './types-layer';

/**
 * Computes the central origin of a GeoJSON FeatureCollection.
 *
 * @param geojson - Feature collection whose bounding box center should be used
 * as the origin.
 * @returns The `[longitude, latitude]` center of the collection bounding box,
 * or `[0, 0]` when no valid coordinates are present.
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
 *
 * @param source - GeoJSON feature collection or geometry to inspect.
 * Pass `null` to receive a `null` result.
 * @returns A named geographic bounding box spanning all coordinates in the
 * source, or `null` when the source is empty or contains no valid geometry.
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
 * Computes a geometry centroid using geometry-aware weighting.
 *
 * Polygonal geometries use area-weighted centroids, linear geometries use
 * length-weighted segment midpoints, and point geometries use coordinate
 * averages. Geometry collections combine child centroids using those same
 * geometric weights.
 *
 * @param geometry - GeoJSON geometry whose centroid should be computed.
 * @returns A three-component centroid tuple `[x, y, z]`, or `null` when the
 * geometry is `null` or cannot yield a meaningful centroid.
 */
export function computeGeometryCentroid(geometry: Geometry | null): [number, number, number] | null {
    if (!geometry) return null;
    const weighted = computeWeightedCentroid(geometry);
    return weighted ? weighted.centroid : null;
}

/**
 * Visits every coordinate contained in a GeoJSON geometry.
 *
 * @param geom - Geometry whose coordinates should be traversed.
 * @param expand - Callback invoked for each coordinate position encountered.
 * @returns Nothing. The provided callback is used for side effects such as
 * updating running bounds.
 */
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

/**
 * Internal weighted centroid used when combining centroid contributions from
 * multiple geometries or geometry parts.
 */
type WeightedCentroid = {
    centroid: [number, number, number];
    weight: number;
};

/**
 * Computes a geometry centroid together with the weight used to combine it
 * with other centroids.
 *
 * Point geometries contribute unit weight, line geometries contribute total
 * length, and polygon geometries contribute total area.
 *
 * @param geometry - Geometry to reduce into a weighted centroid.
 * @returns The weighted centroid and its aggregation weight, or `null` when no
 * meaningful centroid can be derived.
 */
function computeWeightedCentroid(geometry: Geometry): WeightedCentroid | null {
    switch (geometry.type) {
        case 'Point':
            return {
                centroid: [geometry.coordinates[0], geometry.coordinates[1], geometry.coordinates[2] ?? 0],
                weight: 1,
            };
        case 'MultiPoint':
            return averagePositions(geometry.coordinates);
        case 'LineString':
            return computeLineCentroid(geometry.coordinates);
        case 'MultiLineString':
            return combineWeightedCentroids(geometry.coordinates.map((line) => computeLineCentroid(line)));
        case 'Polygon':
            return computePolygonCentroid(geometry.coordinates);
        case 'MultiPolygon':
            return combineWeightedCentroids(geometry.coordinates.map((polygon) => computePolygonCentroid(polygon)));
        case 'GeometryCollection':
            return combineWeightedCentroids(geometry.geometries.map((child) => computeWeightedCentroid(child)));
    }
}

/**
 * Computes the arithmetic mean of a list of positions.
 *
 * Missing Z components are treated as `0`.
 *
 * @param positions - Positions to average.
 * @returns A weighted centroid whose weight equals the number of positions, or
 * `null` when the input is empty.
 */
function averagePositions(positions: Position[]): WeightedCentroid | null {
    if (positions.length === 0) return null;

    let x = 0;
    let y = 0;
    let z = 0;
    for (const position of positions) {
        x += position[0];
        y += position[1];
        z += position[2] ?? 0;
    }

    return {
        centroid: [x / positions.length, y / positions.length, z / positions.length],
        weight: positions.length,
    };
}

/**
 * Computes a length-weighted centroid for a line string.
 *
 * Each segment contributes its midpoint weighted by segment length. Degenerate
 * zero-length lines fall back to a simple average of the input positions.
 *
 * @param positions - Ordered line positions.
 * @returns A weighted centroid whose weight equals total line length, or
 * `null` when no positions are provided.
 */
function computeLineCentroid(positions: Position[]): WeightedCentroid | null {
    if (positions.length === 0) return null;
    if (positions.length === 1) return averagePositions(positions);

    let totalLength = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;

    for (let i = 0; i < positions.length - 1; i++) {
        const start = positions[i];
        const end = positions[i + 1];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1], (end[2] ?? 0) - (start[2] ?? 0));
        if (length === 0) continue;

        totalLength += length;
        weightedX += ((start[0] + end[0]) * 0.5) * length;
        weightedY += ((start[1] + end[1]) * 0.5) * length;
        weightedZ += (((start[2] ?? 0) + (end[2] ?? 0)) * 0.5) * length;
    }

    if (totalLength === 0) {
        return averagePositions(positions);
    }

    return {
        centroid: [weightedX / totalLength, weightedY / totalLength, weightedZ / totalLength],
        weight: totalLength,
    };
}

/**
 * Computes an area-weighted centroid for a polygon with optional holes.
 *
 * The exterior ring contributes positive area and interior rings subtract from
 * the total, matching standard polygon centroid calculations.
 *
 * @param rings - Polygon rings in GeoJSON order, with the shell first and any
 * holes following.
 * @returns A weighted centroid whose weight equals polygon area, or `null`
 * when the polygon has no usable coordinates.
 */
function computePolygonCentroid(rings: Position[][]): WeightedCentroid | null {
    const shell = rings[0];
    if (!shell || shell.length === 0) return null;

    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;
    let totalAreaContribution = 0;

    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
        const ring = rings[ringIndex];
        const ringCentroid = computeRingCentroid(ring);
        if (!ringCentroid) continue;

        const areaContribution = Math.abs(ringCentroid.signedArea) * (ringIndex === 0 ? 1 : -1);
        weightedX += ringCentroid.centroid[0] * areaContribution;
        weightedY += ringCentroid.centroid[1] * areaContribution;
        weightedZ += ringCentroid.centroid[2] * areaContribution;
        totalAreaContribution += areaContribution;
    }

    const totalArea = Math.abs(totalAreaContribution);
    if (totalArea === 0) {
        const flattened = rings.flat();
        return averagePositions(flattened);
    }

    return {
        centroid: [weightedX / totalAreaContribution, weightedY / totalAreaContribution, weightedZ / totalAreaContribution],
        weight: totalArea,
    };
}

/**
 * Computes the signed-area centroid for a single polygon ring.
 *
 * @param ring - Closed polygon ring to analyze.
 * @returns The ring centroid and signed area contribution, or `null` when the
 * ring has fewer than three positions or zero area.
 */
function computeRingCentroid(ring: Position[]): { centroid: [number, number, number]; signedArea: number } | null {
    if (ring.length < 3) return null;

    let crossSum = 0;
    let centroidX = 0;
    let centroidY = 0;
    let weightedZ = 0;

    for (let i = 0; i < ring.length - 1; i++) {
        const current = ring[i];
        const next = ring[i + 1];
        const cross = current[0] * next[1] - next[0] * current[1];
        crossSum += cross;
        centroidX += (current[0] + next[0]) * cross;
        centroidY += (current[1] + next[1]) * cross;
        weightedZ += (((current[2] ?? 0) + (next[2] ?? 0)) * 0.5) * cross;
    }

    const signedArea = crossSum * 0.5;
    if (signedArea === 0) return null;

    return {
        centroid: [
            centroidX / (6 * signedArea),
            centroidY / (6 * signedArea),
            weightedZ / crossSum,
        ],
        signedArea,
    };
}

/**
 * Combines multiple weighted centroids into a single weighted centroid.
 *
 * @param centroids - Weighted centroid candidates to aggregate.
 * `null` entries and zero-weight centroids are ignored.
 * @returns The combined weighted centroid, or `null` when no valid weighted
 * centroids are provided.
 */
function combineWeightedCentroids(
    centroids: Array<WeightedCentroid | null>,
): WeightedCentroid | null {
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;

    for (const centroid of centroids) {
        if (!centroid || centroid.weight === 0) continue;
        totalWeight += centroid.weight;
        weightedX += centroid.centroid[0] * centroid.weight;
        weightedY += centroid.centroid[1] * centroid.weight;
        weightedZ += centroid.centroid[2] * centroid.weight;
    }

    if (totalWeight === 0) return null;

    return {
        centroid: [weightedX / totalWeight, weightedY / totalWeight, weightedZ / totalWeight],
        weight: totalWeight,
    };
}
