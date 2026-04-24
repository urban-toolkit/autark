/**
 * @module LayerTriangles2D
 * 2D triangle layer with optional border rendering.
 *
 * This module defines `Triangles2DLayer`, a vector layer specialization for
 * triangulated 2D polygonal geometry. In addition to the standard filled
 * triangle rendering provided by `VectorLayer`, it manages derived border
 * geometry and an auxiliary border pipeline so outlines stay synchronized with
 * the main layer data.
 */

import { Camera, LayerBorder, LayerBorderComponent } from './types-core';

import {
    LayerInfo,
    LayerRenderInfo,
    LayerData
} from './types-layers';

import { VectorLayer } from './layer-vector';

import { Renderer } from './renderer';

import { PipelineTriangleBorder } from './pipeline-triangle-border';

/**
 * Vector layer for triangulated 2D geometry with optional borders.
 *
 * `Triangles2DLayer` extends `VectorLayer` with additional geometry and GPU
 * pipeline management for line-based borders associated with filled triangle
 * meshes. Border data is loaded alongside the main layer geometry and, when
 * present, is rendered as a separate pass using a dedicated pipeline.
 */
export class Triangles2DLayer extends VectorLayer {
    /** Packed 2D border vertex positions. */
    protected _borderPosition: Float32Array = new Float32Array(0);

    /** Packed border index buffer. */
    protected _borderIndices: Uint32Array = new Uint32Array(0);

    /** Cumulative border component ranges aligned with rendered features. */
    protected _borderComponents: LayerBorderComponent[] = [];

    /** Border rendering pipeline, created only when border geometry exists. */
    protected _pipelineBorder!: PipelineTriangleBorder;

    /**
     * Creates a 2D triangles layer.
     *
     * Border geometry is reloaded after the base `VectorLayer` constructor runs
     * because field initializers reset the border arrays after the polymorphic
     * `loadLayerData` call made by the parent class.
     *
     * @param layerInfo Static layer metadata such as id, type, and z-index.
     * @param layerRenderInfo Mutable rendering configuration for visibility,
     * color mapping, opacity, and picking.
     * @param layerData Geometry, thematic values, and optional border data used
     * to populate the layer.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData, 2);
        // Field initializers run after super() and overwrite data set during the
        // polymorphic loadLayerData call inside VectorLayer.constructor.
        // Re-load border data explicitly so it is available for createPipeline.
        this.loadBorderGeometry(layerData.border ?? []);
        this.loadBorderComponent(layerData.borderComponents ?? []);
    }

    /** Packed 2D border vertex positions. */
    get borderPosition(): Float32Array {
        return this._borderPosition;
    }

    /** Packed border index buffer. */
    get borderIndices(): Uint32Array {
        return this._borderIndices;
    }

    /** Cumulative border component ranges aligned with rendered features. */
    get borderComponents(): LayerBorderComponent[] {
        return this._borderComponents;
    }

    /**
     * Loads layer geometry, thematic data, and border metadata.
     *
     * This extends the base `VectorLayer` loading path by rebuilding the packed
     * border buffers and cumulative border-component ranges from the optional
     * border data stored in `layerData`.
     *
     * @param layerData Layer payload containing triangle geometry and optional
     * border geometry/components.
     * @returns Nothing. The layer's CPU-side geometry caches are replaced in
     * place.
     */
    override loadLayerData(layerData: LayerData): void {
        super.loadLayerData(layerData);

        this.loadBorderGeometry(layerData.border ?? []);
        this.loadBorderComponent(layerData.borderComponents ?? []);
    }

    /**
     * Packs per-feature border geometry into contiguous buffers.
     *
     * Input border segments are concatenated into single position and index
     * arrays. Indices are rebased as each segment is appended so the resulting
     * buffers can be uploaded directly to the border pipeline.
     *
     * @param border Border geometry chunks to merge.
     * @returns Nothing. Existing packed border position and index buffers are
     * replaced.
     */
    loadBorderGeometry(border: LayerBorder[]): void {
        let totalVerts = 0;
        let totalIndices = 0;
        for (const b of border) {
            totalVerts += b.position.length;
            totalIndices += b.indices.length;
        }

        const position = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);

        let vOffset = 0;
        let iOffset = 0;
        let vertexCount = 0;

        for (let id = 0; id < border.length; id++) {
            const b = border[id];
            
            position.set(b.position, vOffset);

            for (let i = 0; i < b.indices.length; i++) {
                indices[iOffset + i] = b.indices[i] + vertexCount;
            }

            const vertsAdded = b.position.length / 2; // Always 2D for 2D borders
            vOffset += b.position.length;
            iOffset += b.indices.length;
            vertexCount += vertsAdded;
        }

        this._borderPosition = position;
        this._borderIndices = indices;
    }

    /**
     * Builds cumulative border component ranges for feature-level lookup.
     *
     * Each stored component accumulates point and line counts from the start of
     * the border buffers through the corresponding feature, matching the range
     * convention used by the main vector components.
     *
     * @param borderComponents Per-feature border component metadata.
     * @returns Nothing. Existing border component ranges are replaced.
     */
    loadBorderComponent(borderComponents: LayerBorderComponent[]): void {
        this._borderComponents = [];

        const accum = { nPoints: 0, nLines: 0 };
        for (let cId = 0; cId < borderComponents.length; cId++) {
            const comp = borderComponents[cId];

            accum.nPoints += comp.nPoints;
            accum.nLines += comp.nLines;

            this._borderComponents.push({
                nPoints: accum.nPoints,
                nLines: accum.nLines
            });
        }
    }

    /**
     * Creates GPU pipelines for the filled triangles and optional border pass.
     *
     * The border pipeline is created only when packed border geometry is
     * available.
     *
     * @param renderer Renderer that owns the WebGPU device and shared render
     * state.
     * @returns Nothing. Required GPU pipeline resources are created for the
     * layer.
     */
    override createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        if (this._borderPosition.length > 0) {
            this._pipelineBorder = new PipelineTriangleBorder(renderer);
            this._pipelineBorder.build(this);
        }
    }

    /**
     * Renders the filled geometry and, when present, the border pass.
     *
     * The border pipeline reuses the layer's current z-index and updates its
     * vertex buffers whenever the layer data was dirty at the start of the pass.
     * This preserves synchronization between filled geometry updates and border
     * rendering.
     *
     * @param camera Active view and projection camera.
     * @param passEncoder Render pass encoder for the current frame.
     * @returns Nothing. Draw commands are recorded into the provided render
     * pass.
     */
    override renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        // VectorLayer.renderPass() clears dirty flags after updating the main
        // fill/picking pipelines, so preserve the data-dirty state needed to
        // keep the border buffers in sync for skip/geometry changes.
        const dataDirty = this._dataIsDirty;

        super.renderPass(camera, passEncoder);

        if (!this._pipelineBorder) { return; }

        if (dataDirty) {
            this._pipelineBorder.updateVertexBuffers(this);
        }

        this._pipelineBorder.updateZIndex(this._layerInfo.zIndex);
        this._pipelineBorder.renderPass(camera, passEncoder);
    }

    /**
     * Releases GPU resources owned by the layer and its border pipeline.
     *
     * @returns Nothing. After destruction, GPU resources owned by this layer
     * are no longer usable.
     */
    override destroy(): void {
        super.destroy();
        this._pipelineBorder?.destroy();
    }
}
