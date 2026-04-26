/**
 * @module AutkComputeApi
 * Typed parameter definitions for the render and GPGPU compute pipelines.
 *
 * This module defines the public configuration shapes consumed by the render
 * and GPGPU pipelines.
 */

import { FeatureCollection } from 'geojson';

import { LayerType } from 'autk-core';

// ── Render pipeline ───────────────────────────────────────────────────────────

/**
 * Describes one geometry layer rendered for each sampled viewpoint.
 */
export interface RenderLayer {
    /** Unique layer identifier used to scope aggregation results. */
    id: string;

    /** GeoJSON collection triangulated for this layer. */
    collection: FeatureCollection;

    /** Layer type used for triangulation and aggregation buckets. */
    type: LayerType;

    /** Optional feature property used as a stable object identifier. */
    objectIdProperty?: string;
}

/**
 * Controls how camera viewpoints are sampled from each derived origin.
 */
export interface RenderViewSampling {
    /** Number of horizontal render directions per feature; values below 1 are clamped to 1. */
    directions?: number;

    /** Starting azimuth in degrees for the first sample. @default 0 */
    azimuthOffsetDeg?: number;

    /** Shared vertical pitch in degrees applied to every sample. @default 0 */
    pitchDeg?: number;
}

/**
 * Selects how view origins are derived from the viewpoints collection.
 */
export type RenderViewpointStrategy =
    | { type: 'centroid' }
    | {
        /** Number of floors used to build the window layout. */
        floors: number;
        type: 'building-windows';
    };

/**
 * Configures the collection and strategy used to derive render viewpoints.
 */
export interface RenderViewpoints {
    /** GeoJSON collection used to derive camera origins and receive results. */
    collection: FeatureCollection;

    /** Strategy used to derive origins. @default { type: 'centroid' } */
    strategy?: RenderViewpointStrategy;

    /** Camera sampling controls applied to each derived origin. */
    sampling?: RenderViewSampling;
}

/**
 * Optional camera controls for the render pipeline.
 */
export interface RenderCameraOptions {
    /** Horizontal field of view in degrees. @default 90 */
    fov?: number;

    /** Optional clipping-plane overrides. */
    clip?: {
        /** Near clipping plane distance. @default 1 */
        near?: number;

        /** Far clipping plane distance. @default 5000 */
        far?: number;
    };
}

/**
 * Controls how sampled render results are reduced back onto the viewpoints collection.
 */
export type RenderAggregation =
    | {
        /** Aggregate pixels by layer type. */
        type: 'classes';

        /** Count the transparent render background as an extra bucket. */
        includeBackground?: boolean;

        /** Layer type used for the transparent render background. @default 'background' */
        backgroundLayerType?: string;
    }
    | {
        /** Aggregate per-object visibility metrics. */
        type: 'objects';
    };

/**
 * Parameters for the render pipeline.
 */
export interface RenderPipelineParams {
    /** Geometry layers rendered from each sampled camera. */
    layers: RenderLayer[];

    /** Reduction strategy applied after rendering. */
    aggregation: RenderAggregation;

    /** Viewpoint collection and origin/sampling strategy used for the render pass. */
    viewpoints: RenderViewpoints;

    /** Optional camera controls. */
    camera?: RenderCameraOptions;

    /** Tile resolution in pixels; must be a multiple of 8. @default 64 */
    tileSize?: number;
}

// ── GPGPU pipeline ────────────────────────────────────────────────────────────

/**
 * Parameters for the GPGPU pipeline.
 */
export interface GpgpuPipelineParams {
    /** GeoJSON FeatureCollection to process. */
    collection: FeatureCollection;

    /** Maps WGSL variable names to feature property dot-paths. */
    variableMapping: Record<string, string>;

    /** Per-feature fixed-length arrays keyed by WGSL variable name. */
    attributeArrays?: Record<string, number>;

    /** Per-feature matrices keyed by WGSL variable name. */
    attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;

    /** Global scalar constants shared across the dispatch. */
    uniforms?: Record<string, number>;

    /** Global fixed-length arrays shared across the dispatch. */
    uniformArrays?: Record<string, number[]>;

    /** Global matrices shared across the dispatch. */
    uniformMatrices?: Record<string, { data: number[][]; cols: number }>;

    /** WGSL function body inserted into the generated `compute_value` function. */
    wgslBody: string;

    /** Name of the single output field written when the shader returns one value. */
    resultField?: string;

    /** Output column names for array or vector results. */
    outputColumns?: string[];
}
