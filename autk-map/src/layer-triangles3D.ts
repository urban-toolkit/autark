/**
 * @module Triangles3DLayer
 * A 3D triangle-mesh layer with per-vertex normal generation.
 *
 * This module defines `Triangles3DLayer`, a specialized vector layer for
 * rendering indexed triangle geometry in 3D. In addition to the standard
 * vector-layer data flow, it maintains derived vertex normals used by the
 * building SSAO pipeline and keeps those normals synchronized with geometry
 * updates before rendering.
 */

import { Camera, LayerGeometry } from './types-core';

import {
    LayerInfo,
    LayerRenderInfo,
    LayerData
} from './types-layers';

import { VectorLayer } from './layer-vector';

import { Renderer } from './renderer';

import { PipelineBuildingSSAO } from './pipeline-triangle-ssao';
import { PipelineTrianglePicking } from './pipeline-triangle-picking';

/**
 * 3D indexed-triangle layer with derived lighting normals.
 *
 * `Triangles3DLayer` extends `VectorLayer` for triangle meshes rendered in
 * three dimensions. It computes one normal vector per vertex from the current
 * indexed geometry, keeps those normals invalidated when geometry changes, and
 * ensures the derived buffers are ready before render passes that depend on
 * lighting or geometry-only output.
 *
 * @example
 * const layer = new Triangles3DLayer(layerInfo, layerRenderInfo, layerData);
 * layer.loadGeometry(meshGeometry);
 * layer.createPipeline(renderer);
 */
export class Triangles3DLayer extends VectorLayer {
    /**
     * Vertex normals for lighting calculations.
     * One normal (3 floats: x, y, z) per vertex.
     * @type {Float32Array}
     */
    protected _normal: Float32Array = new Float32Array(0);

    /**
     * Tracks whether normals are out of sync with current geometry.
     * @type {boolean}
     */
    protected _normalsAreDirty: boolean = false;

    private readonly COORD_DIM = 3;

    /**
     * Creates a 3D triangle layer.
     *
     * The layer is initialized with a fixed coordinate dimension of `3` and
     * immediately derives normals from the initial geometry payload, if any.
     *
     * @param {LayerInfo} layerInfo Layer metadata such as id, type, and z-index.
     * @param {LayerRenderInfo} layerRenderInfo Initial render configuration for color, opacity, and picking.
     * @param {LayerData} layerData Initial geometry, component metadata, and thematic data.
     * @returns {Triangles3DLayer} A new 3D triangles layer instance.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData, 3);
        this.computeNormals();
    }

    /**
     * Gets the derived per-vertex normal buffer.
     *
     * The returned array stores three floats per vertex in xyz order and is
     * kept aligned with the current position buffer.
     *
     * @returns {Float32Array} The vertex-normal buffer used for lighting.
     */
    get normal(): Float32Array {
        return this._normal;
    }

    /**
     * Loads geometry for the layer and invalidates derived normals.
     *
     * Normals are not recomputed eagerly here. Instead, the layer marks them as
     * dirty so the next render preparation or render pass can rebuild them from
     * the updated indexed geometry.
     *
     * @param {LayerGeometry[]} layerGeometry Geometry chunks to load into the layer.
     * @returns {void} The layer geometry is replaced and normals are marked dirty.
     */
    override loadGeometry(layerGeometry: LayerGeometry[]): void {
        super.loadGeometry(layerGeometry);
        this._normalsAreDirty = true;
    }

    /**
     * Creates the render and picking pipelines for the layer.
     *
     * The main rendering pipeline uses the SSAO-enabled building triangle
     * implementation, while the picking pipeline uses triangle-based picking in
     * the layer's fixed 3D dimension.
     *
     * @param {Renderer} renderer Renderer that owns the WebGPU device and shared resources.
     * @returns {void} The layer pipelines are created and built against the current layer state.
     */
    override createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineBuildingSSAO(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer, this._dimension);
        this._pipelinePicking.build(this);
    }

    /**
     * Renders the layer during the standard render pass.
     *
     * If geometry changed since normals were last derived, normals are rebuilt
     * immediately before delegating to the base vector-layer render flow.
     *
     * @param {Camera} camera Active camera for view and projection state.
     * @param {GPURenderPassEncoder} passEncoder Render-pass encoder for the active pass.
     * @returns {void} The layer is rendered into the current pass when not skipped by base-layer logic.
     */
    override renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        if (this._normalsAreDirty) {
            this.computeNormals();
        }

        super.renderPass(camera, passEncoder);
    }

    /**
     * Prepares derived geometry state required for rendering.
     *
     * This override ensures per-vertex normals are synchronized with the latest
     * geometry before later render stages consume the layer. The camera argument
     * is accepted to match the base-layer lifecycle but is not used here.
     *
     * @param {Camera} _camera Active camera passed by the renderer's prepare phase.
     * @returns {void} Normals are recomputed if geometry invalidated the cached values.
     */
    override prepareRender(_camera: Camera): void {
        if (this._normalsAreDirty) {
            this.computeNormals();
        }
    }

    /**
     * Renders the layer's scene geometry into the geometry pass.
     *
     * This method keeps normal data current, pushes pending render-info and
     * vertex-buffer updates to the active pipelines, refreshes the pipeline
     * z-index from the current layer metadata, and then delegates the draw call
     * to the SSAO geometry pass implementation.
     *
     * Render-info updates are applied only when flagged dirty. Vertex-buffer
     * uploads are applied to both the main render pipeline and the picking
     * pipeline when layer data changed.
     *
     * @param {Camera} camera Active camera for view and projection uniforms.
     * @param {GPURenderPassEncoder} passEncoder Render-pass encoder for the scene geometry pass.
     * @returns {void} Pending layer state is synchronized and the geometry pass is issued.
     */
    renderSceneGeometry(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        if (this._normalsAreDirty) {
            this.computeNormals();
        }

        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        if (this._dataIsDirty) {
            this._pipeline.updateVertexBuffers(this);
            this._pipelinePicking.updateVertexBuffers(this);
            this._dataIsDirty = false;
        }

        this._pipeline.updateZIndex(this._layerInfo.zIndex);
        (this._pipeline as PipelineBuildingSSAO).renderGeometryPass(camera, passEncoder);
    }

    /**
     * Recomputes per-vertex normals from the current indexed triangle geometry.
     *
     * The normal buffer is recreated to match the current vertex count, face
     * normals are accumulated for each referenced triangle, and the accumulated
     * vectors are normalized per vertex. When the layer has no positions or no
     * triangle indices, the normal buffer is cleared instead.
     *
     * @returns {void} The normal buffer is rebuilt and the dirty flag is cleared.
     */
    private computeNormals(): void {
        if (this._position.length === 0 || this._indices.length === 0) {
            this._normal = new Float32Array(0);
            this._normalsAreDirty = false;
            return;
        }

        const vertexCount = this._position.length / this.COORD_DIM;
        this._normal = new Float32Array(vertexCount * this.COORD_DIM);

        this._accumulateFaceNormals();
        this._normalizeVertexNormals();

        this._normalsAreDirty = false;
    }

    /**
     * Accumulates unnormalized face normals into each referenced vertex normal.
     *
     * For every indexed triangle, this method computes the cross product of two
     * triangle edges and adds the resulting face normal to the three vertices
     * that form the triangle. The accumulation operates in place on
     * `this._normal`, which is expected to be zero-initialized before this
     * method runs.
     *
     * @returns {void} Face-normal contributions are summed into the vertex-normal buffer.
     */
    private _accumulateFaceNormals(): void {
        for (let triIdx = 0; triIdx < this._indices.length; triIdx += 3) {
            const i0 = this._indices[triIdx];
            const i1 = this._indices[triIdx + 1];
            const i2 = this._indices[triIdx + 2];

            const p0 = i0 * this.COORD_DIM;
            const p1 = i1 * this.COORD_DIM;
            const p2 = i2 * this.COORD_DIM;

            const e1x = this._position[p1]     - this._position[p0];
            const e1y = this._position[p1 + 1] - this._position[p0 + 1];
            const e1z = this._position[p1 + 2] - this._position[p0 + 2];

            const e2x = this._position[p2]     - this._position[p0];
            const e2y = this._position[p2 + 1] - this._position[p0 + 1];
            const e2z = this._position[p2 + 2] - this._position[p0 + 2];

            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;

            for (const vi of [i0, i1, i2]) {
                const n = vi * this.COORD_DIM;
                this._normal[n]     += nx;
                this._normal[n + 1] += ny;
                this._normal[n + 2] += nz;
            }
        }
    }

    /**
     * Normalizes the accumulated normal vector for each vertex.
     *
     * Vertices with a near-zero accumulated magnitude receive a fallback normal
     * of `(0, 1, 0)` instead of attempting to divide by a very small value.
     * This keeps the normal buffer well-formed even when geometry is degenerate
     * or does not contribute a stable face normal for a vertex.
     *
     * @returns {void} The vertex-normal buffer is normalized in place.
     */
    private _normalizeVertexNormals(): void {
        const vertexCount = this._normal.length / this.COORD_DIM;
        for (let i = 0; i < vertexCount; i++) {
            const n = i * this.COORD_DIM;
            const nx = this._normal[n];
            const ny = this._normal[n + 1];
            const nz = this._normal[n + 2];
            const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (mag > 1e-6) {
                this._normal[n]     = nx / mag;
                this._normal[n + 1] = ny / mag;
                this._normal[n + 2] = nz / mag;
            } else {
                this._normal[n]     = 0;
                this._normal[n + 1] = 1;
                this._normal[n + 2] = 0;
            }
        }
    }
}
