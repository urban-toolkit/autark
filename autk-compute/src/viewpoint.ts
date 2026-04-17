import {
    FeatureCollection,
    Geometry,
    Position,
} from 'geojson';

import { Camera } from 'autk-core';

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

export function generateViewOrigins(source: FeatureCollection): ViewOrigin[] {
    const origins: ViewOrigin[] = [];

    source.features.forEach((feature, sourceIndex) => {
        if (!feature.geometry) return;

        const origin = geometryBarycenter(feature.geometry);
        if (!origin) return;

        origins.push({ sourceIndex, origin });
    });

    return origins;
}

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

function geometryBarycenter(geometry: Geometry): [number, number, number] | null {
    const positions = flattenPositions(geometry);
    if (positions.length === 0) return null;

    let x = 0;
    let y = 0;
    let z = 0;

    for (const pos of positions) {
        x += pos[0];
        y += pos[1];
        z += pos[2] ?? 0;
    }

    return [x / positions.length, y / positions.length, z / positions.length];
}

function flattenPositions(geometry: Geometry): Position[] {
    switch (geometry.type) {
        case 'Point':
            return [geometry.coordinates];
        case 'MultiPoint':
        case 'LineString':
            return geometry.coordinates;
        case 'MultiLineString':
        case 'Polygon':
            return geometry.coordinates.flat();
        case 'MultiPolygon':
            return geometry.coordinates.flat(2);
        case 'GeometryCollection':
            return geometry.geometries.flatMap(flattenPositions);
        default:
            return [];
    }
}

function degToRad(value: number): number {
    return (value * Math.PI) / 180;
}
