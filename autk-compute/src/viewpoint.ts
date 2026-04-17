import {
    FeatureCollection,
    Feature,
    LineString,
} from 'geojson';

import { Camera } from 'autk-core';

/**
 * Generates one centroid viewpoint per feature from a FeatureCollection.
 *
 * Each feature contributes exactly one 2-point `LineString` viewpoint:
 * - Point 0: centroid of the feature geometry (eye position)
 * - Point 1: centroid offset slightly in the feature's principal direction
 *   (first→last coordinate), used as the camera look-at target
 *
 * Supported geometry types:
 * - `Point`: coordinate as-is, looks north
 * - `LineString`: mean of all coordinates, direction from first to last
 * - `MultiLineString`: mean of all coordinates across all lines, first→last
 * - `Polygon`: mean of outer ring coordinates, looks north
 * - `MultiPolygon`: mean of first outer ring coordinates, looks north
 * - All other types are skipped
 *
 * @param source - Any FeatureCollection.
 * @returns FeatureCollection of 2-point LineString features, one per input feature.
 *
 * @example
 * const viewpoints = generateViewpoints(osmRoads);
 *
 * @see {@link buildCameraMatrices} for converting viewpoints to view-projection matrices.
 * @see {@link ComputeRender.run} for the render pipeline that uses these viewpoints.
 */
export function generateViewpoints(source: FeatureCollection): FeatureCollection {
    const viewpoints: Feature[] = [];

    for (const feature of source.features) {
        const geom = feature.geometry;
        if (!geom) continue;

        const props = feature.properties ? { ...feature.properties } : {};
        let coords: number[][] = [];
        let dir: [number, number] = [0, 1];

        if (geom.type === 'Point') {
            const [lon, lat] = geom.coordinates;
            viewpoints.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [[lon, lat], [lon, lat + 1e-5]] } as LineString,
                properties: props,
            });
            continue;
        } else if (geom.type === 'LineString') {
            coords = geom.coordinates;
            if (coords.length >= 2)
                dir = [coords[coords.length - 1][0] - coords[0][0], coords[coords.length - 1][1] - coords[0][1]];
        } else if (geom.type === 'MultiLineString') {
            coords = geom.coordinates.flat();
            if (coords.length >= 2)
                dir = [coords[coords.length - 1][0] - coords[0][0], coords[coords.length - 1][1] - coords[0][1]];
        } else if (geom.type === 'Polygon') {
            coords = geom.coordinates[0];
        } else if (geom.type === 'MultiPolygon') {
            coords = geom.coordinates[0][0];
        } else {
            continue;
        }

        if (coords.length === 0) continue;

        const [lon, lat] = coordsCentroid(coords);
        const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
        const scale = len > 1e-9 ? 1e-5 / len : 1e-5;

        viewpoints.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[lon, lat], [lon + dir[0] * scale, lat + dir[1] * scale]],
            } as LineString,
            properties: props,
        });
    }

    return { type: 'FeatureCollection', features: viewpoints };
}

/**
 * Builds a flat array of view-projection matrices (16 floats each) for every viewpoint.
 *
 * Each viewpoint feature is converted to a camera using the following convention:
 * - The first coordinate of the LineString is the eye position
 * - The second coordinate determines the look direction
 * - The camera is positioned at `eyeHeight` above ground
 *
 * @param viewpoints - FeatureCollection of viewpoints (LineString or Point geometry).
 * @param origin - Scene origin [lon, lat] for coordinate normalization.
 * @param eyeHeight - Camera eye height above ground in scene units (default: 1.7).
 * @param fovDeg - Horizontal field of view in degrees (default: 90).
 * @param near - Near clipping plane distance (default: 1).
 * @param far - Far clipping plane distance (default: 5000).
 * @returns Flat Float32Array of 4×4 view-projection matrices (16 floats per viewpoint).
 *
 * @example
 * const origin = computeOrigin(source);
 * const cameras = buildCameraMatrices(viewpoints, origin, 1.7, 90, 1, 5000);
 *
 * @see {@link Camera.buildViewProjection} from autk-core for the underlying camera API.
 * @see {@link generateViewpoints} for generating viewpoint features.
 */
export function buildCameraMatrices(
    viewpoints: FeatureCollection,
    origin: [number, number],
    eyeHeight: number,
    fovDeg: number,
    near: number,
    far: number,
): Float32Array {
    const N = viewpoints.features.length;
    const cameras = new Float32Array(N * 16);

    for (let i = 0; i < N; i++) {
        const geom = viewpoints.features[i].geometry as any;
        let p0: number[];
        let p1: number[];

        if (geom.type === 'LineString') {
            p0 = geom.coordinates[0];
            p1 = geom.coordinates.length > 1
                ? geom.coordinates[1]
                : [geom.coordinates[0][0] + 1, geom.coordinates[0][1]];
        } else if (geom.type === 'MultiLineString') {
            p0 = geom.coordinates[0][0];
            p1 = geom.coordinates[0].length > 1
                ? geom.coordinates[0][1]
                : [geom.coordinates[0][0][0] + 1, geom.coordinates[0][0][1]];
        } else {
            // Point: look north
            p0 = [geom.coordinates[0], geom.coordinates[1]];
            p1 = [geom.coordinates[0], geom.coordinates[1] + 1];
        }

        const mx = (p0[0] + p1[0]) * 0.5 - origin[0];
        const my = (p0[1] + p1[1]) * 0.5 - origin[1];
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        const ndx = len > 0 ? dx / len : 1;
        const ndy = len > 0 ? dy / len : 0;

        cameras.set(
            Camera.buildViewProjection({
                eye: [mx, my, eyeHeight],
                lookAt: [mx + ndx, my + ndy, eyeHeight],
                up: [0, 0, 1],
                fovDeg,
                aspect: 1.0,
                near,
                far,
            }),
            i * 16
        );
    }

    return cameras;
}

// ── Module-private helpers ────────────────────────────────────────────────────

function coordsCentroid(coords: number[][]): [number, number] {
    let lon = 0, lat = 0;
    for (const c of coords) { lon += c[0]; lat += c[1]; }
    return [lon / coords.length, lat / coords.length];
}
