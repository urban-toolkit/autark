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

import { Camera, LayerBorder, LayerBorderComponent } from '@urban-toolkit/autk-core';

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

    /**
     * Per-border-vertex skip flags: `1` for the vertices of the borders of skipped features. Border vertices are
     * laid out differently from the fill's, so the fill's flags cannot be used for them.
     */
    protected _borderSkippedVertices: Float32Array = new Float32Array(0);

    /** Border rendering pipeline, created only when border geometry exists. */
    protected _pipelineBorder!: PipelineTriangleBorder;

    /**
     * Creates a 2D triangles layer.
     *
     * Border geometry is reloaded after the base `VectorLayer` constructor runs
     * because field initializers reset the border arrays after the polymorphic
     * `loadLayerData` call made by the parent class.
     *
     * @param layerInfo Static layer metadata such as id and type.
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

    /** Per-border-vertex skip flags, aligned with {@link borderPosition}: `1` hides the vertex. */
    get borderSkippedVertices(): Float32Array {
        return this._borderSkippedVertices;
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

        this._syncBorderSkipped();
    }

    /** Skips the given components, in the fill and in the border. */
    override setSkipped(ids: number[]): void {
        super.setSkipped(ids);
        this._syncBorderSkipped();
    }

    /**
     * Rebuilds the border skip flags from the skipped components.
     *
     * Fill component `i` and border component `i` are the same feature: both are built once per drawable feature, in
     * order, and skip the same ones. A border component covers the border vertices from the end of the previous one
     * to its own cumulative `nPoints`.
     */
    private _syncBorderSkipped(): void {
        // While a base-class constructor loads the first data, this class's fields do not exist yet: the constructor
        // loads the border again once they do, and that call sets the flags up.
        const vertexCount = this._borderPosition.length / 2;
        if (!this._borderSkippedVertices || this._borderSkippedVertices.length !== vertexCount) {
            this._borderSkippedVertices = new Float32Array(vertexCount);
        } else {
            this._borderSkippedVertices.fill(0);
        }

        for (const id of this._skippedIds ?? []) {
            if (id < 0 || id >= this._borderComponents.length) { continue; }
            const start = id > 0 ? this._borderComponents[id - 1].nPoints : 0;
            this._borderSkippedVertices.fill(1, start, this._borderComponents[id].nPoints);
        }
        // The skip upload happens at the next render, after this has run.
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

    protected override syncGeometry(): void {
        if (this._dataIsDirty) this._pipelineBorder?.updateVertexBuffers(this);
        super.syncGeometry();
    }

    protected override uploadVisibleFeatureState(highlight: boolean, skip: boolean): void {
        super.uploadVisibleFeatureState(highlight, skip);
        if (skip) this._pipelineBorder?.updateFeatureState(this);
    }

    /** Draws the fill followed by the border, when enabled. */
    override renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        const renderInfoDirty = this._renderInfoIsDirty;
        super.renderPass(camera, passEncoder);

        if (!this._pipelineBorder) { return; }

        if (renderInfoDirty) {
            this._pipelineBorder.updateColorUniforms(this);
        }

        // Keep hidden border buffers/uniforms synchronized so toggling them back on needs no reload.
        if (this._layerRenderInfo.showBorders !== false) {
            this._pipelineBorder.renderPass(camera, passEncoder);
        }
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
