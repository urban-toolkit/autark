/**
 * @module RasterLayer
 * Raster-backed map layer rendering.
 *
 * This module defines the `RasterLayer` class, which stores triangulated raster
 * surface geometry, raster texture payloads, and the WebGPU pipeline state used
 * to render them. It is responsible for loading raster geometry and component
 * metadata, converting scalar rasters into RGBA texture data using the active
 * color-map and transfer-function configuration, and synchronizing those data
 * updates with the raster rendering pipeline.
 */

import { 
    LayerInfo,
    LayerRenderInfo,
    LayerData,
} from "./types-layers";

import {
    Camera,
    LayerGeometry,
    LayerComponent,
    ColorMap,
    DEFAULT_TRANSFER_FUNCTION,
    buildTransferContext,
    computeAlphaByte,
} from './types-core';

import type { 
    TransferFunction,
    RequiredTransferFunction
} from './types-core';

import { Layer } from "./layer";

import { Renderer } from "./renderer";

import { Pipeline } from "./pipeline";

import { PipelineTriangleRaster } from "./pipeline-triangle-raster";

/**
 * Raster layer implementation backed by triangulated geometry and texture data.
 *
 * `RasterLayer` extends the generic layer lifecycle with raster-specific data
 * loading and rendering behavior. It stores flattened 2D triangle geometry,
 * cumulative component metadata, raster resolution, and both scalar and RGBA
 * raster payloads. Scalar rasters are colorized on load using the active
 * colormap configuration and transfer function before being uploaded through
 * the raster pipeline.
 */
export class RasterLayer extends Layer {
    /** Triangle vertex positions. */
    protected _position!: Float32Array;

    /** Triangle index buffer. */
    protected _indices!: Uint32Array;

    /** Texture coordinates aligned with raster vertices. */
    protected _texCoord!: Float32Array;

    /** Cumulative per-feature component metadata. */
    protected _components: LayerComponent[] = [];

    /** Raster width in pixels. */
    protected _rasterResX!: number;

    /** Raster height in pixels. */
    protected _rasterResY!: number;

    /** RGBA raster payload consumed by the GPU pipeline. */
    protected _rasterData!: Float32Array;

    /** Canonical scalar raster payload used for domain recomputation. */
    protected _rasterValues: Float32Array = new Float32Array(0);

    /** Opacity transfer-function configuration used while rebuilding raster RGBA data. */
    protected _transferFunction: RequiredTransferFunction = { ...DEFAULT_TRANSFER_FUNCTION };

    /** WebGPU pipeline used to render the raster layer. */
    protected _pipeline!: Pipeline;

    /**
     * Creates a raster layer from precomputed layer metadata and raster payloads.
     *
     * The constructor delegates all geometry, component, and raster loading to
     * `loadLayerData`, which also initializes the raster resolution and derives
     * RGBA texture data when scalar raster values are provided.
     *
     * @param layerInfo Static layer identity and ordering information.
     * @param layerRenderInfo Render-state configuration, including colormap settings.
     * @param layerData Geometry, component metadata, raster resolution, and raster values.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo);

        this.loadLayerData(layerData);
    }

    /** Triangle vertex positions. */
    get position(): Float32Array {
        return this._position;
    }

    /** Triangle index buffer. */
    get indices(): Uint32Array {
        return this._indices;
    }

    /** Texture coordinates aligned with raster vertices. */
    get texCoord(): Float32Array {
        return this._texCoord;
    }

    /** Cumulative per-feature component metadata. */
    get components(): LayerComponent[] {
        return this._components;
    }

    /** Raster width in pixels. */
    get rasterResX(): number {
        return this._rasterResX;
    }

    /** Raster height in pixels. */
    get rasterResY(): number {
        return this._rasterResY;
    }

    /** RGBA raster payload consumed by the GPU pipeline. */
    get rasterData(): Float32Array {
        return this._rasterData;
    }

    /** Original scalar raster values (not normalized). */
    get rasterValues(): Float32Array {
        return this._rasterValues;
    }

    /**
     * Updates the transfer-function configuration used to map scalar values to opacity.
     *
     * The provided values are merged into the existing transfer-function state.
     * This only updates the stored configuration; callers must reload raster
     * values separately if they need the RGBA raster payload to be rebuilt.
     *
     * @param config Partial transfer-function override to apply.
     * @returns Nothing. The transfer-function configuration is updated in place.
     */
    setTransferFunction(config: TransferFunction): void {
        this._transferFunction = {
            ...this._transferFunction,
            ...config,
        };
    }

    /**
     * Loads geometry, components, raster resolution, and raster payloads.
     *
     * Geometry and component metadata are always loaded. Raster resolution is
     * updated only when both `rasterResX` and `rasterResY` are present. Raster
     * values are loaded only when a non-empty raster payload is provided.
     *
     * @param layerData Layer data bundle for the raster layer.
     * @returns Nothing. The layer's CPU-side geometry and raster state are replaced.
     */
    loadLayerData(layerData: LayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);

        if (layerData.rasterResX !== undefined && layerData.rasterResY !== undefined) {
            this._rasterResX = layerData.rasterResX;
            this._rasterResY = layerData.rasterResY;
        }

        if (layerData.raster && layerData.raster.length) {
            this.loadRaster(layerData.raster);
        }
    }

    /**
     * Flattens raster geometry chunks into contiguous position, index, and UV buffers.
     *
     * Indices from each geometry chunk are rebased to the cumulative vertex
     * count so the merged buffers can be rendered as a single indexed mesh.
     * Raster geometry is expected to remain 2D, with one texture-coordinate pair
     * for each vertex.
     *
     * @param layerGeometry Geometry chunks to merge into layer-local buffers.
     * @returns Nothing. The layer geometry buffers are rebuilt in memory.
     */
    loadGeometry(layerGeometry: LayerGeometry[]): void {
        let totalVerts = 0;
        let totalIndices = 0;
        let totalTexCoords = 0;

        for (const g of layerGeometry) {
            totalVerts += g.position.length;
            totalIndices += (g.indices?.length ?? 0);
            totalTexCoords += (g.texCoord?.length ?? 0);
        }

        const position = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);
        const texCoord = new Float32Array(totalTexCoords);

        let vOffset = 0;
        let iOffset = 0;
        let tOffset = 0;
        let vertexCount = 0;

        for (let id = 0; id < layerGeometry.length; id++) {
            const g = layerGeometry[id];
            
            position.set(g.position, vOffset);

            if (g.indices) {
                for (let i = 0; i < g.indices.length; i++) {
                    indices[iOffset + i] = g.indices[i] + vertexCount;
                }
                iOffset += g.indices.length;
            }

            if (g.texCoord) {
                texCoord.set(g.texCoord, tOffset);
                tOffset += g.texCoord.length;
            }

            vOffset += g.position.length;
            vertexCount += g.position.length / 2; // Raster is always 2D
        }

        // Raster triangles are expected to be 2D vertices and 2D UV pairs.
        console.assert(position.length % 2 === 0, 'Raster geometry position length must be a multiple of 2.');
        console.assert(texCoord.length % 2 === 0, 'Raster geometry texCoord length must be a multiple of 2.');
        console.assert(position.length === texCoord.length, 'Raster geometry and texCoord arrays should have matching lengths.');
        
        this._position = position;
        this._indices = indices;
        this._texCoord = texCoord;
    }

    /**
     * Builds cumulative component metadata for the merged raster geometry.
     *
     * Each stored component keeps running totals for points and triangles so
     * downstream consumers can address the flattened geometry by feature.
     * Feature index and feature id metadata are preserved from the source
     * components.
     *
     * @param layerComponents Per-feature component metadata to accumulate.
     * @returns Nothing. The component list is rebuilt from the provided data.
     */
    loadComponent(layerComponents: LayerComponent[]): void {
        this._components = [];

        const accum = { nPoints: 0, nTriangles: 0 };
        for (let cId = 0; cId < layerComponents.length; cId++) {
            const comp = layerComponents[cId];

            accum.nPoints += comp.nPoints;
            accum.nTriangles += comp.nTriangles;

            this._components.push({
                nPoints: accum.nPoints,
                nTriangles: accum.nTriangles,
                featureIndex: comp.featureIndex,
                featureId: comp.featureId,
            });
        }
    }

    /**
     * Loads raster values and rebuilds the RGBA texture payload.
     *
     * If the input length matches `rasterResX * rasterResY * 4`, the values are
     * treated as a precomputed RGBA raster and copied directly. Otherwise the
     * input is treated as a scalar raster, colorized using the active colormap,
     * and assigned per-pixel opacity using the current transfer function.
     * `NaN` samples produce fully transparent pixels.
     *
     * When a numeric computed colormap domain is available, transfer-function
     * statistics are derived from values inside that domain. If no valid scalar
     * values remain, the raster payload is cleared to transparent black.
     *
     * @param rasterValues Flattened scalar or RGBA raster values.
     * @returns Nothing. The stored scalar values and RGBA raster payload are updated when input is non-empty.
     */
    loadRaster(rasterValues: Float32Array): void {
        if (!rasterValues || rasterValues.length === 0) {
            return;
        }

        this._rasterValues = rasterValues;

        const isRGBA = rasterValues.length === this._rasterResX * this._rasterResY * 4;
        const rasterData = new Float32Array(isRGBA ? rasterValues.length : this._rasterResX * this._rasterResY * 4);

        if (!isRGBA) {
            const validValues: number[] = [];
            for (let i = 0; i < rasterValues.length; i++) {
                if (!isNaN(rasterValues[i])) validValues.push(rasterValues[i]);
            }

            const colorDomain = this._layerRenderInfo.colormap.computedDomain;
            const numericDomain = (
                Array.isArray(colorDomain)
                && colorDomain.length > 0
                && colorDomain.every(v => typeof v === 'number')
            )
                ? colorDomain as [number, number] | [number, number, number]
                : null;

            const transferValues = numericDomain
                ? validValues.filter(v => v >= numericDomain[0] && v <= numericDomain[numericDomain.length - 1])
                : validValues;

            const transferContext = buildTransferContext(
                transferValues.length > 0 ? transferValues : validValues,
                this._transferFunction,
            );

            if (transferContext.validCount === 0) {
                rasterData.fill(0);
                this._rasterData = rasterData;
                return;
            }

            for (let i = 0; i < rasterValues.length; i++) {
                const d = rasterValues[i];
                const offset = i * 4;
                if (isNaN(d)) {
                    rasterData[offset] = 0;
                    rasterData[offset + 1] = 0;
                    rasterData[offset + 2] = 0;
                    rasterData[offset + 3] = 0;
                    continue;
                }

                const effectiveDomain = numericDomain ?? [transferContext.min, transferContext.max] as [number, number];

                const color = ColorMap.getColor(
                    d,
                    this._layerRenderInfo.colormap.config.interpolator,
                    effectiveDomain,
                );
                const alpha = computeAlphaByte(d, transferContext);

                rasterData[offset] = color.r;
                rasterData[offset + 1] = color.g;
                rasterData[offset + 2] = color.b;
                rasterData[offset + 3] = alpha;
            }
        }
        else {
            rasterData.set(rasterValues);
        }

        this._rasterData = rasterData;
    }

    /**
     * Creates the raster rendering pipeline for this layer.
     *
     * The pipeline is instantiated as `PipelineTriangleRaster` and built against
     * the layer's current geometry and raster state.
     *
     * @param renderer Renderer that owns the GPU device and shared resources.
     * @returns Nothing. The layer becomes ready for raster draw calls.
     */
    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineTriangleRaster(renderer);
        this._pipeline.build(this);
    }

    /**
     * Renders the raster layer during the current render pass.
     *
     * Dirty geometry or raster data trigger raster vertex-buffer and uniform
     * updates before drawing. Dirty render-info state triggers a color-uniform
     * update. The layer z-index is refreshed on every call before delegating the
     * draw to the underlying pipeline.
     *
     * @param camera Active camera used to populate view-dependent uniforms.
     * @param passEncoder Render-pass encoder receiving the draw commands.
     * @returns Nothing. The layer uploads pending state changes and issues its draw call.
     */
    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        if (this._dataIsDirty) {
            const rasterPipeline = this._pipeline as PipelineTriangleRaster;
            rasterPipeline.updateVertexBuffers(this);
            rasterPipeline.updateRasterUniforms(this);
            this._dataIsDirty = false;
        }

        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        this._pipeline.updateZIndex(this._layerInfo.zIndex);
        this._pipeline.renderPass(camera, passEncoder);
    }

    /**
     * Releases GPU resources owned by the raster pipeline.
     *
     * @returns Nothing. Any pipeline resources currently allocated for this layer are destroyed.
     */
    override destroy(): void {
        this._pipeline?.destroy();
    }
}
