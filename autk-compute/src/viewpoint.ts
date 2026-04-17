import { FeatureCollection, Feature, LineString } from 'geojson';
import { Camera } from 'autk-core';

/**
 * Samples street-level viewpoints from a road-network FeatureCollection.
 *
 * `LineString` and `MultiLineString` features are walked coordinate-by-coordinate;
 * a 2-point `LineString` viewpoint is emitted every `intervalMeters` metres, where
 * the two points encode the eye position and the look-ahead direction.
 *
 * `Point` features are passed through unchanged (looking north).
 *
 * @param source - Road network or any FeatureCollection with linear geometry.
 * @param intervalMeters - Sampling distance in metres along linear features (default: 10).
 * @returns FeatureCollection of 2-point LineString and Point features, one per viewpoint.
 */
export function generateViewpoints(source: FeatureCollection, intervalMeters = 10): FeatureCollection {
    const viewpoints: Feature[] = [];

    for (const feature of source.features) {
        const geom = feature.geometry;
        if (!geom) continue;

        const props = feature.properties ? { ...feature.properties } : {};

        if (geom.type === 'LineString') {
            sampleAlongLine(geom.coordinates, intervalMeters, viewpoints, props);
        } else if (geom.type === 'MultiLineString') {
            for (const line of geom.coordinates) {
                sampleAlongLine(line, intervalMeters, viewpoints, props);
            }
        } else if (geom.type === 'Point') {
            const [lon, lat] = geom.coordinates;
            viewpoints.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [[lon, lat], [lon, lat + 1e-5]] } as LineString,
                properties: props,
            });
        }
        // Polygon and other types are intentionally skipped.
    }

    return { type: 'FeatureCollection', features: viewpoints };
}

/**
 * Builds a flat array of view-projection matrices (16 floats each) for every viewpoint.
 * Viewpoint geometry must be a LineString (2-point) or Point feature.
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
        let p0: number[], p1: number[];

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

        const mx  = (p0[0] + p1[0]) * 0.5 - origin[0];
        const my  = (p0[1] + p1[1]) * 0.5 - origin[1];
        const dx  = p1[0] - p0[0];
        const dy  = p1[1] - p0[1];
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
            i * 16,
        );
    }

    return cameras;
}

// ── Module-private helpers ────────────────────────────────────────────────────

/**
 * Samples viewpoint features along a coordinate sequence at a fixed interval.
 * Each output is a 2-point LineString encoding position + road direction.
 */
function sampleAlongLine(
    coords: number[][],
    intervalMeters: number,
    out: Feature[],
    properties: Record<string, unknown>,
): void {
    if (coords.length < 2) return;
    let distSinceLastSample = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const segLen = geoDistanceMeters(p0, p1);
        if (segLen < 1e-9) continue;

        // Normalised direction in degrees-per-metre, used to encode look-ahead.
        const nx = (p1[0] - p0[0]) / segLen;
        const ny = (p1[1] - p0[1]) / segLen;

        let offset = intervalMeters - distSinceLastSample;

        while (offset <= segLen) {
            const t = offset / segLen;
            const lon = p0[0] + t * (p1[0] - p0[0]);
            const lat = p0[1] + t * (p1[1] - p0[1]);
            out.push({
                type: 'Feature',
                // Second coordinate is 1 m forward in road direction; encodes look-ahead for the camera.
                geometry: { type: 'LineString', coordinates: [[lon, lat], [lon + nx, lat + ny]] } as LineString,
                properties: { ...properties },
            });
            offset += intervalMeters;
        }

        distSinceLastSample = intervalMeters - (offset - segLen);
    }
}

/** Equirectangular approximation of ground distance between two lon/lat points, in metres. */
function geoDistanceMeters(p0: number[], p1: number[]): number {
    const latMid = (p0[1] + p1[1]) * 0.5 * (Math.PI / 180);
    const dx = (p1[0] - p0[0]) * Math.cos(latMid) * 111320;
    const dy = (p1[1] - p0[1]) * 110540;
    return Math.sqrt(dx * dx + dy * dy);
}
