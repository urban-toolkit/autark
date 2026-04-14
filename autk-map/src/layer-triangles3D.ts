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
 * 3D Triangles layer class.
 * Inherits from VectorLayer and sets the dimension to 3.
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
     * Creates a 3D triangles layer.
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData, 3);
        this.computeNormals();
    }

    /**
     * Gets the vertex normal vectors.
     * @returns {Float32Array} The normals (3 floats per vertex).
     */
    get normal(): Float32Array {
        return this._normal;
    }

    /**
     * Load the geometry data for the layer.
     * Marks normals as dirty so they are recomputed before the next render.
     * @param {LayerGeometry[]} layerGeometry - The geometry data to load.
     */
    override loadGeometry(layerGeometry: LayerGeometry[]): void {
        super.loadGeometry(layerGeometry);
        this._normalsAreDirty = true;
    }

    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    override createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineBuildingSSAO(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer, this._dimension);
        this._pipelinePicking.build(this);
    }

    /**
     * Render the layer for the current pass.
     * Recomputes normals if geometry changed.
     * @param {Camera} camera - The camera instance.
     */
    override renderPass(camera: Camera): void {
        if (this._normalsAreDirty) {
            this.computeNormals();
        }

        super.renderPass(camera);
    }

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
