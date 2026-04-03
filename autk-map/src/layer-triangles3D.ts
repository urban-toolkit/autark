import { LayerInfo, LayerRenderInfo, LayerData } from './layer-types';

import { Renderer } from './renderer';
import { Camera, LayerGeometry } from './core-types';

import { VectorLayer } from './layer-vector';
import { PipelineBuildingSSAO } from './pipeline-triangle-ssao';
import { PipelineTrianglePicking } from './pipeline-triangle-picking';

/**
 * Triangles3DLayer extends VectorLayer to handle rendering of 3D triangles with computed vertex normals.
 * It manages positions, indices, thematic data, and surface normals with SSAO-based rendering.
 */
export class Triangles3DLayer extends VectorLayer {
    /**
     * Vertex normals for lighting calculations.
     * One normal (3 floats: x, y, z) per vertex.
     * @type {number[]}
     */
    protected _normal!: number[];

    /**
     * Tracks whether normals are out of sync with current geometry.
     * Set to true when geometry changes; recomputed lazily in renderPass.
     * @type {boolean}
     */
    protected _normalsAreDirty: boolean = false;

    /**
     * Coordinate dimension for 3D triangles (always 3 for x, y, z).
     * @type {number}
     */
    private readonly COORD_DIM = 3;

    /**
     * Constructor for Triangles3DLayer.
     * Initializes with 3D dimension and computes vertex normals from geometry data.
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data including geometry to compute normals from.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData, 3);
        this._normal = [];
        this.computeNormals();
    }

    /**
     * Get the readonly vertex normal vectors.
     * @returns {readonly number[]} - The normals (3 floats per vertex for x, y, z components).
     */
    get normal(): readonly number[] {
        return this._normal;
    }

    /**
     * Create the rendering pipeline for 3D triangles.
     * Initializes SSAO rendering pipeline and picking pipeline.
     * @param {Renderer} renderer - The renderer instance.
     */
    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineBuildingSSAO(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer, this._dimension);
        this._pipelinePicking.build(this);
    }

    /**
     * Override loadGeometry to mark normals as dirty.
     * When geometry changes, vertex normals must be recomputed.
     * @param {LayerGeometry[]} layerGeometry - The geometry data to load.
     */
    loadGeometry(layerGeometry: LayerGeometry[]): void {
        super.loadGeometry(layerGeometry);
        this._normalsAreDirty = true;
    }

    /**
     * Render the layer for the current pass.
     * Recomputes normals if geometry changed, then renders with current pipelines.
     * @param {Camera} camera - The camera instance.
     */
    renderPass(camera: Camera): void {
        // Recompute normals if geometry changed
        if (this._normalsAreDirty) {
            this.computeNormals();
        }

        super.renderPass(camera);
    }

    /**
     * Compute vertex normals from face geometry.
     * Accumulates face normals at each vertex using cross products, then normalizes.
     * Handles degenerate cases (zero-magnitude normals) gracefully.
     * Marks normals as clean after computation.
     */
    private computeNormals(): void {
        // Validate input
        if (this._position.length === 0 || this._indices.length === 0) {
            console.warn('Triangles3DLayer: Cannot compute normals without position/indices data');
            this._normal = [];
            this._normalsAreDirty = false;
            return;
        }

        // Initialize normals array (one normal per vertex: 3 floats each)
        const vertexCount = this._position.length / this.COORD_DIM;
        this._normal = new Array(vertexCount * this.COORD_DIM).fill(0);

        // Accumulate face normals at each vertex
        this._accumulateFaceNormals();

        // Normalize each vertex normal vector
        this._normalizeVertexNormals();

        this._normalsAreDirty = false;
    }

    /**
     * Accumulate face normals for each triangle at its vertices.
     * For each triangle, computes face normal via cross product of edge vectors,
     * then adds this normal to each of the three vertices.
     */
    private _accumulateFaceNormals(): void {
        // Process triangles (3 indices per triangle)
        for (let triIdx = 0; triIdx < this._indices.length; triIdx += 3) {
            // Get vertex indices
            const i0 = this._indices[triIdx];
            const i1 = this._indices[triIdx + 1];
            const i2 = this._indices[triIdx + 2];

            // Get vertex positions (3 coordinates each)
            const p0Start = i0 * this.COORD_DIM;
            const p1Start = i1 * this.COORD_DIM;
            const p2Start = i2 * this.COORD_DIM;

            // Compute edge vectors (v1 - v0) and (v2 - v0)
            const e1x = this._position[p1Start] - this._position[p0Start];
            const e1y = this._position[p1Start + 1] - this._position[p0Start + 1];
            const e1z = this._position[p1Start + 2] - this._position[p0Start + 2];

            const e2x = this._position[p2Start] - this._position[p0Start];
            const e2y = this._position[p2Start + 1] - this._position[p0Start + 1];
            const e2z = this._position[p2Start + 2] - this._position[p0Start + 2];

            // Compute face normal via cross product (e1 × e2)
            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;

            // Accumulate face normal at each vertex
            for (const vertexIdx of [i0, i1, i2]) {
                const nStart = vertexIdx * this.COORD_DIM;
                this._normal[nStart] += nx;
                this._normal[nStart + 1] += ny;
                this._normal[nStart + 2] += nz;
            }
        }
    }

    /**
     * Normalize all vertex normal vectors to unit length.
     * Handles zero-magnitude normals (degenerate cases) by using a fallback normal (0, 1, 0).
     */
    private _normalizeVertexNormals(): void {
        const vertexCount = this._normal.length / this.COORD_DIM;
        const epsilon = 1e-6; // Threshold for considering magnitude as zero

        for (let i = 0; i < vertexCount; i++) {
            const nStart = i * this.COORD_DIM;
            const nx = this._normal[nStart];
            const ny = this._normal[nStart + 1];
            const nz = this._normal[nStart + 2];

            // Compute magnitude
            const magnitude = Math.sqrt(nx * nx + ny * ny + nz * nz);

            // Normalize to unit length or use fallback
            if (magnitude > epsilon) {
                this._normal[nStart] = nx / magnitude;
                this._normal[nStart + 1] = ny / magnitude;
                this._normal[nStart + 2] = nz / magnitude;
            } else {
                // Fallback: point upward (0, 1, 0) for degenerate normals
                this._normal[nStart] = 0;
                this._normal[nStart + 1] = 1;
                this._normal[nStart + 2] = 0;
            }
        }
    }
}
