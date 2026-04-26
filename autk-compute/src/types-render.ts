/**
 * @module AutkComputeRender
 * Types for GPU draw payloads used by the compute-backed render pipeline.
 *
 * This module defines the GPU buffer bundle consumed by the render pipeline.
 */

/// <reference types="@webgpu/types" />

import type { LayerGeometry } from 'autk-core';

import type { RenderLayer } from './api';

/**
 * GPU-ready draw record for a single uploaded feature or merged layer.
 */
export interface GpuFeatureDraw {
    /** Vertex buffer with interleaved position data. */
    vBuf: GPUBuffer;

    /** Index buffer containing triangle indices. */
    iBuf: GPUBuffer;

    /** Number of indices issued for the indexed draw call. */
    indexCount: number;

    /** Uniform buffer carrying encoded layer and object ids. */
    idBuf: GPUBuffer;
}

/** Triangulated geometry bundle for one rendered layer. */
export interface LayerMeshData {
    /** Triangulated geometry chunks uploaded for the layer. */
    geometries: LayerGeometry[];

    /** Layer configuration associated with the geometry. */
    layer: RenderLayer;

    /** Zero-based layer index in the render request. */
    layerIndex: number;
}

/** Encoded aggregation metadata for one rendered feature. */
export interface LayerFeatureMeta {
    /** Encoded layer-type bucket index. */
    layerTypeIndex: number;

    /** Encoded object bucket index. */
    objectIndex: number;
}

/** Aggregation metadata resolved for a render request. */
export interface RenderMetadata {
    /** Ordered layer-type names used by class aggregation. */
    layerTypes: string[];

    /** Ordered object keys used by object aggregation. */
    objectKeys: string[];

    /** Layer-type bucket index for each input layer. */
    layerTypeIndexByLayer: number[];

    /** Per-layer feature metadata used during object aggregation. */
    featureMetaByLayer: LayerFeatureMeta[][];

    /** Indicates whether class aggregation is enabled. */
    includeClasses: boolean;

    /** Indicates whether object aggregation is enabled. */
    includeObjects: boolean;

    /** Bit flags passed to the count shader. */
    flags: number;
}

/** GPU buffers used by the count/aggregation pass. */
export interface CountBuffers {
    /** Storage buffer for layer-type counts. */
    layerTypeBuf: GPUBuffer;

    /** Storage buffer for object visibility counts. */
    objectBuf: GPUBuffer;

    /** Storage buffer mapping samples back to collection indices. */
    sampleSourcesBuf: GPUBuffer;

    /** Uniform buffer containing count-pass parameters. */
    paramsBuf: GPUBuffer;

    /** Allocated byte size of `layerTypeBuf`. */
    layerTypeSize: number;

    /** Allocated byte size of `objectBuf`. */
    objectSize: number;
}

/** Per-object visibility metric written into aggregated render results. */
export interface RenderObjectMetric {
    /** Indicates whether the object was visible in at least one sample. */
    visible: boolean;

    /** Fraction of samples in which the object was visible. */
    sampleRatio: number;
}

/** Cached GPU render pipeline state reused across render batches. */
export interface CachedRenderPipeline {
    /** Render pipeline used for tiled geometry rendering. */
    renderPipeline: GPURenderPipeline;

    /** Bind-group layout for per-sample camera matrices. */
    camBGL: GPUBindGroupLayout;

    /** Bind-group layout for encoded layer/object ids. */
    idBGL: GPUBindGroupLayout;
}

/** Cached GPU compute pipeline state reused across count passes. */
export interface CachedCountPipeline {
    /** Compute pipeline used for class/object aggregation. */
    countPipeline: GPUComputePipeline;

    /** Bind-group layout for the count pass. */
    countBGL: GPUBindGroupLayout;
}
