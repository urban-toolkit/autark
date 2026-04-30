/**
 * @module AutkComputeViewpoint
 * Viewpoint resolution and camera sampling helpers for render pipelines.
 *
 * This module derives camera origins from a viewpoints collection, expands
 * them into sampled camera positions, and builds view-projection matrices.
 */

import {
    FeatureCollection,
} from 'geojson';

import {
    BuildingWindowLayoutEntry,
    Camera,
    computeGeometryCentroid,
    TriangulatorBuildingWithWindows,
} from 'autk-core';

import type { RenderViewSampling, RenderViewpointStrategy, RenderViewpoints } from './api';

const BUILDING_WINDOW_DIRECTION_OFFSETS = [-30, 0, 30] as const;

/** View origin derived from a source feature. */
export interface ViewOrigin {
    /** Source feature index in the viewpoints collection. */
    collectionIndex: number;

    /** World-space origin used as the camera eye position. */
    origin: [number, number, number];
}

/** Concrete camera sample resolved from a view origin. */
export interface CameraSample {
    /** Index used to align sampled results back to the resolved collection or window layout. */
    collectionIndex: number;

    /** Camera eye position in world space. */
    eye: [number, number, number];

    /** Look-at point paired with the sampled eye position. */
    lookAt: [number, number, number];
}

/** Resolved viewpoints and any strategy-specific auxiliary data. */
export interface ResolvedRenderViewpoints {
    /** Viewpoints collection used as the basis for sampling and result alignment. */
    collection: FeatureCollection;

    /** Camera samples generated from the resolved viewpoint strategy. */
    samples: CameraSample[];

    /** Window layout returned by the building-window strategy, if used. */
    windows?: BuildingWindowLayoutEntry[];
}

/**
 * Derives view origins from feature geometry centroids.
 *
 * @param collection GeoJSON FeatureCollection to extract origins from.
 * @returns Array of view origins, one per feature with a valid geometry.
 * @throws Never throws. Features without geometry are silently skipped.
 * @example
 * const origins = generateViewOrigins(buildingsFC);
 * // origins → [{ collectionIndex: 0, origin: [151.2, -33.8, 0] }, ...]
 */
export function generateViewOrigins(collection: FeatureCollection): ViewOrigin[] {
    const origins: ViewOrigin[] = [];

    collection.features.forEach((feature, collectionIndex) => {
        if (!feature.geometry) return;

        const origin = computeGeometryCentroid(feature.geometry);
        if (!origin) return;

        origins.push({ collectionIndex, origin });
    });

    return origins;
}

/**
 * Expands view origins into camera samples around a horizontal ring.
 *
 * @param origins View origins from {@link generateViewOrigins}.
 * @param viewSampling Sampling controls for direction count, azimuth offset, and pitch.
 * @returns Array of camera samples, one per direction per origin.
 * @throws Never throws.
 * @example
 * const samples = expandCameraSamples(origins, { directions: 4, pitchDeg: 30 });
 * // samples.length → origins.length * 4
 */
export function expandCameraSamples(
    origins: ViewOrigin[],
    viewSampling: RenderViewSampling = {},
): CameraSample[] {
    const directions = Math.max(1, Math.floor(viewSampling.directions ?? 1));
    const azimuthOffsetDeg = viewSampling.azimuthOffsetDeg ?? 0;
    const pitchRad = degToRad(viewSampling.pitchDeg ?? 0);
    const samples: CameraSample[] = [];

    for (const viewOrigin of origins) {
        for (let i = 0; i < directions; i++) {
            const azimuthDeg = azimuthOffsetDeg + (360 / directions) * i;
            const azimuthRad = degToRad(azimuthDeg);
            const cosPitch = Math.cos(pitchRad);
            const dirX = Math.cos(azimuthRad) * cosPitch;
            const dirY = Math.sin(azimuthRad) * cosPitch;
            const dirZ = Math.sin(pitchRad);

            samples.push({
                collectionIndex: viewOrigin.collectionIndex,
                eye: [...viewOrigin.origin],
                lookAt: [
                    viewOrigin.origin[0] + dirX,
                    viewOrigin.origin[1] + dirY,
                    viewOrigin.origin[2] + dirZ,
                ],
            });
        }
    }

    return samples;
}

/**
 * Resolves a viewpoints configuration into a collection and camera samples.
 *
 * @param viewpoints Viewpoints collection, strategy, and sampling controls.
 * @returns Resolved collection, samples, and optional building-window layout.
 * @throws Never throws.
 * @example
 * const resolved = resolveRenderViewpoints({
 *   collection: fc,
 *   strategy: { type: 'centroid' },
 *   sampling: { directions: 8 },
 * });
 */
export function resolveRenderViewpoints(
    viewpoints: RenderViewpoints,
): ResolvedRenderViewpoints {
    const collection = viewpoints.collection;
    const strategy: RenderViewpointStrategy = viewpoints.strategy ?? { type: 'centroid' };
    const sampling: RenderViewSampling = viewpoints.sampling ?? {};

    if (strategy.type === 'building-windows') {
        const layout = TriangulatorBuildingWithWindows.buildWindowLayout(collection, strategy.floors);
        return {
            collection: layout.collection,
            samples: buildBuildingWindowCameraSamples(layout.windows),
            windows: layout.windows,
        };
    }

    const origins = generateViewOrigins(collection);
    return {
        collection,
        samples: expandCameraSamples(origins, sampling),
    };
}

/**
 * Builds view-projection matrices for sampled viewpoints, shifted by origin.
 *
 * @param samples Camera samples from {@link expandCameraSamples}.
 * @param origin Reference origin used to shift sample positions into local coordinates.
 * @param fovDeg Horizontal field of view in degrees.
 * @param near Near clipping plane distance.
 * @param far Far clipping plane distance.
 * @returns `Float32Array` of packed 16-element view-projection matrices in sample order.
 * @throws Never throws.
 * @example
 * const matrices = buildCameraMatrices(samples, [151.2, -33.8], 90, 1, 5000);
 * // matrices.length → samples.length * 16
 */
export function buildCameraMatrices(
    samples: CameraSample[],
    origin: [number, number],
    fovDeg: number,
    near: number,
    far: number,
): Float32Array {
    const cameras = new Float32Array(samples.length * 16);

    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const eye: [number, number, number] = [
            sample.eye[0] - origin[0],
            sample.eye[1] - origin[1],
            sample.eye[2],
        ];
        const lookAt: [number, number, number] = [
            sample.lookAt[0] - origin[0],
            sample.lookAt[1] - origin[1],
            sample.lookAt[2],
        ];

        cameras.set(
            Camera.buildViewProjection({
                eye,
                lookAt,
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

/**
 * Builds camera samples for a building-window layout.
 *
 * Each window produces three samples, rotating the window normal by the fixed
 * direction offsets. The returned `collectionIndex` is the window index within
 * the layout output.
 */
function buildBuildingWindowCameraSamples(windows: BuildingWindowLayoutEntry[]): CameraSample[] {
    const samples: CameraSample[] = [];

    windows.forEach((window, collectionIndex) => {
        for (const angleOffset of BUILDING_WINDOW_DIRECTION_OFFSETS) {
            const dir = rotateXY(window.normal, angleOffset);
            samples.push({
                collectionIndex,
                eye: [...window.center],
                lookAt: [
                    window.center[0] + dir[0],
                    window.center[1] + dir[1],
                    window.center[2] + dir[2],
                ],
            });
        }
    });

    return samples;
}

/** Rotates a vector around the Z axis in the XY plane. */
function rotateXY(vector: [number, number, number], angleDeg: number): [number, number, number] {
    const angleRad = degToRad(angleDeg);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return [
        vector[0] * cos - vector[1] * sin,
        vector[0] * sin + vector[1] * cos,
        vector[2],
    ];
}

/** Converts degrees to radians. */
function degToRad(value: number): number {
    return (value * Math.PI) / 180;
}
