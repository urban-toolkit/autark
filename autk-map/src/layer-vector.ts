/**
 * @module VectorLayer
 * Base implementation for renderable vector layers.
 *
 * This module defines `VectorLayer`, an abstract `Layer` subclass that stores
 * flattened vector geometry, per-feature thematic values, and interaction state
 * used for highlighting, skipping, and picking. It also owns the shared GPU
 * pipeline setup used by triangle-based vector rendering passes.
 */

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
 * Abstract base class for vector-backed map layers.
 *
 * `VectorLayer` stores merged geometry buffers, cumulative component metadata,
 * per-vertex thematic values, and interaction masks used by rendering and
 * picking pipelines. Concrete subclasses supply layer-specific semantics while
 * reusing the shared logic for loading flattened geometry, maintaining
 * highlight/skip state, and issuing draw passes.
 */
export abstract class VectorLayer extends Layer {
    /** Vertex dimension used by the position buffer. */
    protected _dimension: number;

    /** Flattened vertex position buffer. */
    protected _position!: Float32Array;

    /** Per-vertex thematic values used for color mapping. */
    protected _thematic!: Float32Array;

    /** Per-vertex validity mask for thematic values. */
    protected _thematicValidity!: Float32Array;

    /** Triangle index buffer into {@link _position}. */
    protected _indices!: Uint32Array;

    /** Cumulative component ranges aligned with source features. */
    protected _components: LayerComponent[] = [];

    /** Component ids currently marked as highlighted. */
    protected _highlightedIds!: Set<number>;

    /** Per-vertex highlight mask. */
    protected _highlightedVertices!: Float32Array;

    /** Component ids currently marked as skipped. */
    protected _skippedIds!: Set<number>;

    /** Per-vertex skip mask. */
    protected _skippedVertices!: Float32Array;

    /** Primary triangle-rendering pipeline. */
    protected _pipeline!: Pipeline;

    /** Off-screen triangle-picking pipeline. */
    protected _pipelinePicking!: PipelineTrianglePicking;

    /** Number of vertices in the position buffer. */
    protected get _vertexCount(): number {
        return this._position.length / this._dimension;
    }

    /**
     * Creates a vector layer and loads its initial buffers.
     *
     * Construction immediately flattens the provided geometry and component
     * metadata into layer-local buffers and resets any interaction state. The
     * optional thematic payload is loaded only when entries are present.
     *
     * @param layerInfo Static layer metadata such as id, type, and z-index.
     * @param layerRenderInfo Render configuration used by shared layer pipelines.
     * @param layerData Initial geometry, component, and optional thematic data.
     * @param dimension Number of coordinates stored per vertex. Use `2` for planar layers and `3` for layers with explicit elevation.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData, dimension: number = 2) {
        super(layerInfo, layerRenderInfo);

        this._dimension = dimension;
        this.loadLayerData(layerData);
    }

    /** Indicates that vector layers participate in picking passes. */
    get supportsPicking(): boolean { return true; }

    /** Indicates that vector layers support per-feature highlighting. */
    get supportsHighlight(): boolean { return true; }

    /** Flattened vertex position buffer. */
    get position(): Float32Array {
        return this._position;
    }

    /** Per-vertex thematic values aligned with {@link position}. */
    get thematic(): Float32Array {
        return this._thematic;
    }

    /** Per-vertex thematic validity mask aligned with {@link thematic}. */
    get thematicValidity(): Float32Array {
        return this._thematicValidity;
    }

    /** Triangle index buffer referencing vertices in {@link position}. */
    get indices(): Uint32Array {
        return this._indices;
    }

    /** Cumulative component ranges aligned with the source feature order. */
    get components(): LayerComponent[] {
        return this._components;
    }

    /** Highlighted component ids as an array snapshot. */
    get highlightedIds(): number[] {
        return Array.from(this._highlightedIds);
    }

    /** Per-vertex highlight mask uploaded to rendering pipelines. */
    get highlightedVertices(): Float32Array {
        return this._highlightedVertices;
    }

    /** Skipped component ids as an array snapshot. */
    get skippedIds(): number[] {
        return Array.from(this._skippedIds);
    }

    /** Per-vertex skip mask uploaded to rendering pipelines. */
    get skippedVertices(): Float32Array {
        return this._skippedVertices;
    }

    /**
     * Replaces the layer's geometry, component metadata, and optional thematic data.
     *
     * Geometry and components are always reloaded together and reset highlight
     * and skip state, because component-to-vertex alignment may change. Thematic
     * data is loaded only when a non-empty thematic array is provided.
     *
     * @param layerData Layer payload containing geometry, components, and optional thematic values.
     * @returns Updates the layer's in-memory buffers and interaction masks.
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
     * Flattens component geometry into shared position and index buffers.
     *
     * Positions from all geometries are concatenated in input order. When an
     * individual geometry provides indices, they are re-based to the current
     * accumulated vertex offset before being appended to the shared index buffer.
     *
     * @param layerGeometry Geometry records to merge into contiguous buffers.
     * @returns Updates {@link position} and {@link indices} in place for subsequent rendering.
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
     * Loads cumulative component ranges for feature-level addressing.
     *
     * Input components are converted into cumulative point and triangle counts.
     * This lets the layer resolve feature-local ranges when applying thematic
     * values or interaction masks by component id.
     *
     * @param layerComponents Per-feature component metadata in source order.
     * @returns Replaces the component table used for thematic aggregation and interaction updates.
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
     * Expands per-component thematic values into per-vertex buffers.
     *
     * Thematic input must contain exactly one entry per loaded component. Each
     * component value is repeated across all vertices belonging to that
     * component, and a parallel validity mask is generated from
     * `LayerThematic.valid`. On mismatch or incomplete filling, the method logs
     * an error and leaves the existing thematic buffers unchanged.
     *
     * @param layerThematic Thematic entries aligned one-to-one with {@link components}.
     * @returns `true` when both thematic buffers were rebuilt successfully; otherwise `false`.
     */
    loadThematic(layerThematic: LayerThematic[]): boolean {
        if (layerThematic.length !== this._components.length) {
            console.error(
                `VectorLayer.loadThematic: expected ${this._components.length} thematic entries, got ${layerThematic.length}.`
            );
            return false;
        }

        const thematic = new Float32Array(this._vertexCount);
        const thematicValidity = new Float32Array(this._vertexCount);

        let offset = 0;
        for (let compId = 0; compId < layerThematic.length; compId++) {
            const aggr = this.aggregateThematicComponent(compId, layerThematic[compId]);
            thematic.set(aggr.value, offset);
            thematicValidity.set(aggr.valid, offset);
            offset += aggr.value.length;
        }

        if (offset !== this._vertexCount) {
            console.error(
                `VectorLayer.loadThematic: filled ${offset} thematic values for ${this._vertexCount} vertices.`
            );
            return false;
        }

        this._thematic = thematic;
        this._thematicValidity = thematicValidity;
        return true;
    }

    /**
     * Builds the render and picking pipelines for this layer.
     *
     * The primary pipeline renders the visible vector pass, and the picking
     * pipeline renders the same geometry into the off-screen picking target.
     * Both pipelines are built against the layer's current buffers.
     *
     * @param renderer Renderer used to create GPU resources and pipeline state.
     * @returns Initializes GPU pipelines required for normal rendering and picking.
     */
    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineTriangleFlat(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer, this._dimension);
        this._pipelinePicking.build(this);
    }

    /**
     * Renders the layer into the active color pass.
     *
     * Pending render-info updates refresh color uniforms before drawing. Pending
     * data updates refresh vertex buffers for both the visible and picking
     * pipelines so the two passes stay aligned.
     *
     * @param camera Camera providing the current view and projection state.
     * @param passEncoder Active render-pass encoder for the current frame.
     * @returns Issues draw commands for the layer's visible triangle pass.
     */
    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
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
        this._pipeline.renderPass(camera, passEncoder);
    }

    /**
     * Renders the layer into the picking target.
     *
     * This pass uses the dedicated picking pipeline and updates its z-index to
     * match the visible pass before rendering.
     *
     * @param camera Camera providing the current view and projection state.
     * @returns Issues draw commands for the off-screen picking pass.
     */
    renderPickingPass(camera: Camera): void {
        this._pipelinePicking.updateZIndex(this._layerInfo.zIndex);
        this._pipelinePicking.renderPass(camera);
    }

    /**
     * Toggles highlight state for the specified component ids.
     *
     * Each id is toggled independently. The corresponding vertex mask is also
     * toggled once per unique vertex referenced by the affected components. Ids
     * outside the current component range are ignored by the vertex update step.
     *
     * @param ids Component ids to toggle.
     * @returns Marks layer render state and GPU data as dirty for the next frame.
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
     * Replaces the current highlight selection.
     *
     * Existing highlight state is cleared before the new ids are applied. The
     * highlight mask is then set to `1` for each unique vertex referenced by the
     * provided component ids.
     *
     * @param ids Component ids that should remain highlighted.
     * @returns Marks layer render state and GPU data as dirty for the next frame.
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
     * Toggles skip state for the specified component ids.
     *
     * Each id is toggled independently, and the per-vertex skip mask is updated
     * once per unique vertex referenced by the affected components. This method
     * does not clear previously skipped ids before applying the toggle.
     *
     * @param ids Component ids to toggle in the skip set.
     * @returns Marks layer render state and GPU data as dirty for the next frame.
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
     * Clears all highlighted component ids and vertex flags.
     *
     * @returns Marks layer render state and GPU data as dirty for the next frame.
     */
    clearHighlightedIds(): void {
        this._highlightedVertices.fill(0);
        this._highlightedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /**
     * Clears all skipped component ids and vertex flags.
     *
     * @returns Marks layer render state and GPU data as dirty for the next frame.
     */
    clearSkippedIds(): void {
        this._skippedVertices.fill(0);
        this._skippedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    /**
     * Releases GPU resources owned by this layer's pipelines.
     *
     * @returns Destroys the visible and picking pipelines when they have been created.
     */
    override destroy(): void {
        this._pipeline?.destroy();
        this._pipelinePicking?.destroy();
    }

    /**
     * Expands one component's thematic payload to the component's vertex range.
     *
     * Missing thematic values default to `0`, and missing validity flags also
     * default to `0`.
     *
     * @param component Index of the component in the cumulative component table.
     * @param layerThematic Thematic payload associated with that component.
     * @returns Object containing per-vertex thematic values and validity flags for the component.
     */
    private aggregateThematicComponent(component: number, layerThematic: LayerThematic): { value: Float32Array; valid: Float32Array } {
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Float32Array(nPoint);
        const thematicValidity = new Float32Array(nPoint);
        const value = layerThematic.value ?? 0;
        thematic.fill(value);
        thematicValidity.fill(layerThematic.valid ?? 0);

        return { value: thematic, valid: thematicValidity };
    }

    /**
     * Resets all interaction masks after geometry or component data changes.
     *
     * The interaction buffers are rebuilt to match the current vertex count, and
     * both highlight and skip id sets are cleared.
     */
    private _resetInteractionState(): void {
        this._highlightedVertices = new Float32Array(this._vertexCount).fill(0);
        this._highlightedIds = new Set<number>();
        this._skippedVertices = new Float32Array(this._vertexCount).fill(0);
        this._skippedIds = new Set<number>();
    }

    /**
     * Visits each unique indexed vertex referenced by the given components.
     *
     * Invalid component ids are ignored. Vertices shared by multiple triangles
     * or component ids are visited only once.
     *
     * @param ids Component ids whose indexed vertices should be traversed.
     * @param fn Callback invoked once for each unique vertex index.
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
