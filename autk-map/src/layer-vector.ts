import { Camera } from 'autk-core';

import {
    LayerComponent, 
    LayerData, 
    LayerGeometry, 
    LayerInfo, 
    LayerRenderInfo, 
    LayerThematic 
} from './layer-types';

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
     * @type {number[]}
     */
    protected _position!: number[];

    /**
     * Thematic data for the layer.
     * @type {number[]}
     */
    protected _thematic!: number[];

    /**
     * Indices of the triangles.
     * @type {number[]}
     */
    protected _indices!: number[];

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
     * @type {number[]}
     */
    protected _highlightedVertices!: number[];

    /**
     * Skipped IDs of the layer.
     * This is a set to ensure uniqueness of skipped IDs.
     * @type {Set<number>}
     */
    protected _skippedIds!: Set<number>;

    /**
     * Skipped vertices of the layer.
     * @type {number[]}
     */
    protected _skippedVertices!: number[];

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
     * @returns {number[]} - The positions of the triangles.
     */
    get position(): number[] {
        return this._position;
    }

    /**
     * Get the thematic data of the layer.
     * @returns {number[]} - The thematic data.
     */
    get thematic(): number[] {
        return this._thematic;
    }

    /**
     * Get the indices of the triangles.
     * @returns {number[]} - The indices of the triangles.
     */
    get indices(): number[] {
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
     * @returns {number[]} The highlighted vertices.
     */
    get highlightedVertices(): number[] {
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
     * @returns {number[]} The skipped vertices.
     */
    get skippedVertices(): number[] {
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
        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            layerGeometry[id].indices?.forEach((a) => {
                const b = a + position.length / this._dimension;
                indices.push(b);
            });

            // merges the position data
            layerGeometry[id].position.forEach((d) => {
                position.push(d);
            });
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
                nTriangles: accum.nTriangles
            });
        }
    }

    /**
     * Load the thematic data for the layer.
     * @param {LayerThematic[]} layerThematic - The thematic data to load.
     */
    loadThematic(layerThematic: LayerThematic[]): void {
        const thematic: number[] = [];

        for (let compId = 0; compId < layerThematic.length; compId++) {
            const aggr = this.aggregateThematicComponent(compId, layerThematic[compId]);
            for (let aId = 0; aId < aggr.length; aId++) {
                thematic.push(aggr[aId]);
            }
        }

        console.assert(thematic.length === this._vertexCount);
        this._thematic = thematic;
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
     * Get the picked ID at the specified screen coordinates.
     * @param x - The x-coordinate of the screen position.
     * @param y - The y-coordinate of the screen position.
     * @returns {Promise<number>} - A promise that resolves to the picked ID.
     */
    getPickedId(x: number, y: number): Promise<number> {
        return this._pipelinePicking.readPickedId(x, y);
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
     * @returns {number[]} - The aggregated thematic data.
     */
    private aggregateThematicComponent(component: number, layerThematic: LayerThematic): number[] {
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Array(nPoint);
        const value = layerThematic.values[0] ?? 0;

        for (let vId = 0; vId < nPoint; vId++) {
            thematic[vId] = value;
        }

        return thematic;
    }

    /**
     * Resets highlight/skip state after full layer-data reload (geometry/components changed).
     */
    private _resetInteractionState(): void {
        this._highlightedVertices = new Array(this._vertexCount).fill(0);
        this._highlightedIds = new Set<number>();
        this._skippedVertices = new Array(this._vertexCount).fill(0);
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