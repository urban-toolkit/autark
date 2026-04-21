import { Camera, LayerComponent, LayerGeometry } from './types-core';

import {
    LayerData, 
    LayerInfo, 
    LayerRenderInfo, 
    LayerThematic 
} from './types-layers';

import { Layer } from './layer';

import { Renderer } from './renderer';

import { Pipeline } from './pipeline';
import { PipelineTriangleFlat } from './pipeline-triangle-flat';
import { PipelineTrianglePicking } from './pipeline-triangle-picking';

/**
 * Vector layer class extends Layer to handle vector data.
 * It manages the positions, thematic data, indices, and components of the layer, as well as the rendering pipelines.
 */
export abstract class VectorLayer extends Layer {
    /**
     * Dimension of the layer.
     * @type {number}
     */
    protected _dimension: number;

    /**
     * Positions of the triangles.
     * @type {Float32Array}
     */
    protected _position!: Float32Array;

    /**
     * Thematic data for the layer.
     * @type {Float32Array}
     */
    protected _thematic!: Float32Array;

    /**
     * Indices of the triangles.
     * @type {Uint32Array}
     */
    protected _indices!: Uint32Array;

    /**
     * Components of the layer.
     * @type {LayerComponent[]}
     */
    protected _components: LayerComponent[] = [];

    /**
     * Highlighted IDs of the layer.
     * This is a set to ensure uniqueness of highlighted IDs.
     * @type {Set<number>}
     */
    protected _highlightedIds!: Set<number>;

    /**
     * Highlighted vertices of the layer.
     * @type {Float32Array}
     */
    protected _highlightedVertices!: Float32Array;

    /**
     * Skipped IDs of the layer.
     * This is a set to ensure uniqueness of skipped IDs.
     * @type {Set<number>}
     */
    protected _skippedIds!: Set<number>;

    /**
     * Skipped vertices of the layer.
     * @type {Float32Array}
     */
    protected _skippedVertices!: Float32Array;

    /**
     * Rendering pipeline for the layer.
     * @type {Pipeline}
     */
    protected _pipeline!: Pipeline;

    /**
     * Pipeline for picking triangles.
     * @type {PipelineTrianglePicking}
     */
    protected _pipelinePicking!: PipelineTrianglePicking;

    /** Number of vertices in the position buffer. */
    protected get _vertexCount(): number {
        return this._position.length / this._dimension;
    }

    /**
     * Creates a vector layer.
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data.
     * @param {number} dimension - The dimension of the layer (2 or 3).
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData, dimension: number = 2) {
        super(layerInfo, layerRenderInfo);

        this._dimension = dimension;
        this.loadLayerData(layerData);
    }

    /** Vector layers support picking interactions. */
    get supportsPicking(): boolean { return true; }

    /** Vector layers support feature highlighting. */
    get supportsHighlight(): boolean { return true; }

    /**
     * Get the positions of the triangles.
     * @returns {Float32Array} - The positions of the triangles.
     */
    get position(): Float32Array {
        return this._position;
    }

    /**
     * Get the thematic data of the layer.
     * @returns {Float32Array} - The thematic data.
     */
    get thematic(): Float32Array {
        return this._thematic;
    }

    /**
     * Get the indices of the triangles.
     * @returns {Uint32Array} - The indices of the triangles.
     */
    get indices(): Uint32Array {
        return this._indices;
    }

    /**
     * Get the components of the layer.
     * @returns {LayerComponent[]} - The components of the layer.
     */
    get components(): LayerComponent[] {
        return this._components;
    }

    /**
     * Gets the IDs of the highlighted components in the layer.
     * @returns {number[]} The highlighted IDs.
     */
    get highlightedIds(): number[] {
        return Array.from(this._highlightedIds);
    }

    /**
     * Gets the highlighted vertices of the layer.
     * @returns {Float32Array} The highlighted vertices.
     */
    get highlightedVertices(): Float32Array {
        return this._highlightedVertices;
    }

    /**
     * Gets the IDs of the skipped components in the layer.
     * @returns {number[]} The skipped IDs.
     */
    get skippedIds(): number[] {
        return Array.from(this._skippedIds);
    }

    /**
     * Gets the skipped vertices of the layer.
     * @returns {Float32Array} The skipped vertices.
     */
    get skippedVertices(): Float32Array {
        return this._skippedVertices;
    }

    /**
     * Load the layer data, including geometry and components.
     * @param {LayerData} layerData - The data associated with the layer.
     */
    loadLayerData(layerData: LayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);
        this._resetInteractionState();

        if (layerData.thematic && layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        }
    }

    /**
     * Load the geometry data for the layer.
     * @param {LayerGeometry[]} layerGeometry - The geometry data to load.
     */
    loadGeometry(layerGeometry: LayerGeometry[]): void {
        let totalVerts = 0;
        let totalIndices = 0;
        for (const g of layerGeometry) {
            totalVerts += g.position.length;
            totalIndices += (g.indices?.length ?? 0);
        }

        const position = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);

        let vOffset = 0;
        let iOffset = 0;
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

            const vertsAdded = g.position.length / this._dimension;
            vOffset += g.position.length;
            vertexCount += vertsAdded;
        }

        this._position = position;
        this._indices = indices;
    }

    /**
     * Load the components of the layer.
     * @param {LayerComponent[]} layerComponents - The components to load.
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
     * Load the thematic data for the layer.
     * @param {LayerThematic[]} layerThematic - The thematic data to load.
     * @returns {boolean} `true` when the thematic buffer was updated successfully.
     */
    loadThematic(layerThematic: LayerThematic[]): boolean {
        if (layerThematic.length !== this._components.length) {
            console.error(
                `VectorLayer.loadThematic: expected ${this._components.length} thematic entries, got ${layerThematic.length}.`
            );
            return false;
        }

        const thematic = new Float32Array(this._vertexCount);

        let offset = 0;
        for (let compId = 0; compId < layerThematic.length; compId++) {
            const aggr = this.aggregateThematicComponent(compId, layerThematic[compId]);
            thematic.set(aggr, offset);
            offset += aggr.length;
        }

        if (offset !== this._vertexCount) {
            console.error(
                `VectorLayer.loadThematic: filled ${offset} thematic values for ${this._vertexCount} vertices.`
            );
            return false;
        }

        this._thematic = thematic;
        return true;
    }

    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineTriangleFlat(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer, this._dimension);
        this._pipelinePicking.build(this);
    }

    /**
     * Render the layer for the current pass.
     * @param {Camera} camera - The camera instance.
     */
    renderPass(camera: Camera): void {
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
        this._pipeline.renderPass(camera);
    }

    /**
     * Render the picking pass for the layer.
     * @param {Camera} camera - The camera instance.
     */
    renderPickingPass(camera: Camera): void {
        this._pipelinePicking.updateZIndex(this._layerInfo.zIndex);
        this._pipelinePicking.renderPass(camera);
    }

    /**
     * Toggle highlighted IDs for the layer.
     * @param {number[]} ids - The IDs to highlight.
     */
    toggleHighlightedIds(ids: number[]): void {
        ids.forEach(id => {
            if (this._highlightedIds.has(id)) {
                this._highlightedIds.delete(id);
            }
            else {
                this._highlightedIds.add(id);
            }
        });

        this._forEachUniqueVertexInComponents(ids, (vertexIndex) => {
            this._highlightedVertices[vertexIndex] = 1 - this._highlightedVertices[vertexIndex];
        });

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /**
     * Set highlighted IDs for the layer.
     * @param {number[]} ids - The IDs to highlight.
     */
    setHighlightedIds(ids: number[]): void {
        this.clearHighlightedIds();
        
        this._highlightedIds = new Set(ids);

        this._forEachUniqueVertexInComponents(ids, (vertexIndex) => {
            this._highlightedVertices[vertexIndex] = 1;
        });

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }    

    /**
     * Set skipped IDs for the layer.
     * @param {number[]} ids - The IDs to skip.
     */
    setSkippedIds(ids: number[]): void {
        ids.forEach(id => {
            if (this._skippedIds.has(id)) {
                this._skippedIds.delete(id);
            }
            else {
                this._skippedIds.add(id);
            }
        });

        this._forEachUniqueVertexInComponents(ids, (vertexIndex) => {
            this._skippedVertices[vertexIndex] = 1 - this._skippedVertices[vertexIndex];
        });

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /**
     * Clears the highlighted components of the layer.
     */
    clearHighlightedIds(): void {
        this._highlightedVertices.fill(0);
        this._highlightedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /**
     * Clears the skipped components of the layer.
     */
    clearSkippedIds(): void {
        this._skippedVertices.fill(0);
        this._skippedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /** Releases GPU resources owned by vector pipelines. */
    override destroy(): void {
        this._pipeline?.destroy();
        this._pipelinePicking?.destroy();
    }

    /**
     * Expands scalar thematic value to all vertices of a component.
     * @param {number} component - The component index.
     * @param {LayerThematic} layerThematic - The thematic data to aggregate.
     * @returns {Float32Array} - The aggregated thematic data.
     */
    private aggregateThematicComponent(component: number, layerThematic: LayerThematic): Float32Array {
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Float32Array(nPoint);
        const value = layerThematic.values[0] ?? 0;
        thematic.fill(value);

        return thematic;
    }

    /**
     * Resets highlight/skip state after full layer-data reload (geometry/components changed).
     */
    private _resetInteractionState(): void {
        this._highlightedVertices = new Float32Array(this._vertexCount).fill(0);
        this._highlightedIds = new Set<number>();
        this._skippedVertices = new Float32Array(this._vertexCount).fill(0);
        this._skippedIds = new Set<number>();
    }

    /**
     * Iterates each unique vertex used by the given component ids.
     */
    private _forEachUniqueVertexInComponents(ids: number[], fn: (vertexIndex: number) => void): void {
        const visited = new Set<number>();

        for (const id of ids) {
            if (id < 0 || id >= this._components.length) { continue; }

            const sTriangle = id > 0 ? this._components[id - 1].nTriangles : 0;
            const eTriangle = this._components[id].nTriangles;

            for (let i = 3 * sTriangle; i < 3 * eTriangle; i++) {
                const vertexIndex = this._indices[i];
                if (visited.has(vertexIndex)) { continue; }
                visited.add(vertexIndex);
                fn(vertexIndex);
            }
        }
    }
}
