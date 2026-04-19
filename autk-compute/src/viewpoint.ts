import {
    FeatureCollection,
} from 'geojson';

import { Camera, computeGeometryCentroid } from 'autk-core';

import type { RenderViewSampling } from './api';

export interface ViewOrigin {
    sourceIndex: number;
    origin: [number, number, number];
}

export interface CameraSample {
    sourceIndex: number;
    azimuthDeg: number;
    eye: [number, number, number];
    lookAt: [number, number, number];
}

/**
 * Derives view origins from each feature's geometry centroid.
 *
 * @param source - GeoJSON FeatureCollection to extract origins from.
 * @returns Array of view origins, one per feature with a valid geometry.
 */
export function generateViewOrigins(source: FeatureCollection): ViewOrigin[] {
    const origins: ViewOrigin[] = [];

    source.features.forEach((feature, sourceIndex) => {
        if (!feature.geometry) return;

        const origin = computeGeometryCentroid(feature.geometry);
        if (!origin) return;

        origins.push({ sourceIndex, origin });
    });

    return origins;
}

/**
 * Expands view origins into camera samples by generating azimuthal directions.
 *
 * @param origins - View origins from {@link generateViewOrigins}.
 * @param viewSampling - Sampling controls for direction count, offset, and pitch.
 * @returns Array of camera samples, one per direction per origin.
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
                sourceIndex: viewOrigin.sourceIndex,
                azimuthDeg,
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
 * Builds row-major view-projection matrices for each camera sample.
 *
 * @param samples - Camera samples from {@link expandCameraSamples}.
 * @param origin - Reference origin for relative camera positioning.
 * @param fovDeg - Horizontal field of view in degrees.
 * @param near - Near clipping plane distance.
 * @param far - Far clipping plane distance.
 * @returns Float32Array of 16-element view-projection matrices.
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

function degToRad(value: number): number {
    return (value * Math.PI) / 180;
}
