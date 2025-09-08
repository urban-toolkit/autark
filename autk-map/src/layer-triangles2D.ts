import { ILayerComponent, ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';
import { RenderPipeline, ThematicAggregationLevel } from './constants';

import { Layer } from './layer';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { Pipeline } from './pipeline';
import { PipelineTriangleFlat } from './pipeline-triangle-flat';
import { PipelineTrianglePicking } from './pipeline-triangle-picking';

/**
 * Triangles2DLayer class extends Layer to handle rendering of 2D triangles layers.
 * It manages the positions, thematic data, indices, and components of the layer, as well as the rendering pipelines.
 */
export class Triangles2DLayer extends Layer {
    /**
     * Dimension of the layer (2 for a 2D layer).
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
     * @type {ILayerComponent[]}
     */
    protected _components: ILayerComponent[] = [];

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

    /**
     * Constructor for Triangles2DLayer
     * @param {ILayerInfo} layerInfo - The layer information.
     * @param {ILayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {ILayerData} layerData - The layer data.
     * @param {number} dimension - The dimension of the layer (2 or 3).
     */
    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData, dimension: number = 2) {
        super(layerInfo, layerRenderInfo);
        this._dimension = dimension;

        this.loadData(layerData);
    }

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
     * @returns {ILayerComponent[]} - The components of the layer.
     */
    get components(): ILayerComponent[] {
        return this._components;
    }

    /**
     * Get the picked ID at the specified screen coordinates.
     * @param x - The x-coordinate of the screen position.
     * @param y - The y-coordinate of the screen position.
     * @returns {Promise<number>} - A promise that resolves to the picked ID.
     */
    public getPickedId(x: number, y: number): Promise<number> {
        return this._pipelinePicking.readPickedId(x, y);
    }

    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    public createPipeline(renderer: Renderer): void {
        if (this.layerRenderInfo.pipeline === RenderPipeline.TRIANGLE_FLAT) {
            this._pipeline = new PipelineTriangleFlat(renderer);
        }
        else if (this.layerRenderInfo.pipeline === RenderPipeline.TRIANGLE_HEATMAP) {
            this._pipeline = new PipelineTriangleFlat(renderer, 'heatmap');
        }
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer);
        this._pipelinePicking.build(this);
    }

    /**
     * Load the layer data, including geometry and components.
     * @param {ILayerData} layerData - The data associated with the layer.
     */
    public loadData(layerData: ILayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);

        if (layerData.thematic && layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        }

        this._highlightedVertices = new Array(this._position.length / 3).fill(0);
        this._highlightedIds = new Set<number>();

        this._skippedVertices = new Array(this._position.length / 3).fill(0);
        this._skippedIds = new Set<number>();
    }

    /**
     * Load the geometry data for the layer.
     * @param {ILayerGeometry[]} layerGeometry - The geometry data to load.
     */
    public loadGeometry(layerGeometry: ILayerGeometry[]): void {
        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            layerGeometry[id].indices?.forEach((a) => {
                const b = a + position.length / 3;
                indices.push(b);
            });

            // merges the position data
            layerGeometry[id].position.forEach((d, id) => {
                if (this._dimension === 2) {
                    position.push(d);

                    if (id % 2 === 1) {
                        const z = this._layerInfo.zValue;
                        position.push(z);
                    }
                }

                if (this._dimension === 3) {
                    if (id % 3 === 2) {
                        d += this._layerInfo.zValue;
                    }

                    position.push(d);
                }
            });
        }

        this._position = position;
        this._indices = indices;
    }

    /**
     * Load the components of the layer.
     * @param {ILayerComponent[]} layerComponents - The components to load.
     */
    public loadComponent(layerComponents: ILayerComponent[]): void {
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
     * @param {ILayerThematic[]} layerThematic - The thematic data to load.
     */
    public loadThematic(layerThematic: ILayerThematic[]): void {
        const thematic: number[] = [];

        for (let compId = 0; compId < layerThematic.length; compId++) {
            let aggr: number[] = [];

            switch (layerThematic[compId].level) {
                case ThematicAggregationLevel.AGGREGATION_POINT:
                    aggr = this.aggregateThematicPoint(layerThematic[compId]);
                    break;
                case ThematicAggregationLevel.AGGREGATION_PRIMITIVE:
                    aggr = this.aggregateThematicPrimitive(compId, layerThematic[compId]);
                    break;
                case ThematicAggregationLevel.AGGREGATION_COMPONENT:
                    aggr = this.aggregateThematicComponenet(compId, layerThematic[compId]);
                    break;
                default:
                    console.error(`Unknown thematic layer aggregation type: ${layerThematic[compId].level}.`);
                    break;
            }

            for (let aId = 0; aId < aggr.length; aId++) {
                thematic.push(aggr[aId]);
            }
        }

        console.assert(thematic.length === this._position.length / 3);
        this._thematic = thematic;
    }

    /**
     * Render the layer for the current pass.
     * @param {Camera} camera - The camera instance.
     */
    public renderPass(camera: Camera): void {
        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        if (this._dataInfoIsDirty) {
            this._pipeline.updateVertexBuffers(this);
            this._dataInfoIsDirty = false;
        }

        this._pipeline.renderPass(camera);
    }

    /**
     * Render the picking pass for the layer.
     * @param {Camera} camera - The camera instance.
     */
    public renderPickingPass(camera: Camera): void {
        this._pipelinePicking.renderPass(camera);
    }

    /**
     * Set highlighted IDs for the layer.
     * @param {number[]} ids - The IDs to highlight.
     */
    public setHighlightedIds(ids: number[]): void {
        // If id is already in highlightedIds, remove it (i.e., toggle it off)
        ids.forEach(id => {
            if(this._highlightedIds.has(id)) {
                this._highlightedIds.delete(id);
            }
            else {
                this._highlightedIds.add(id);
            }
        });

        const toggled = new Set<number>();
        for (const id of ids) {
            if (id < 0) continue;

            const sTriangle = id > 0 ? this._components[id - 1].nTriangles : 0;
            const eTriangle = this._components[id].nTriangles;

            for (let i = 3 * sTriangle; i < 3 * eTriangle; i++) {
                const vertexIndex = this._indices[i];

                if (!toggled.has(vertexIndex)) {
                    this._highlightedVertices[vertexIndex] = 1 - this._highlightedVertices[vertexIndex];
                    toggled.add(vertexIndex);
                }
            }
        }

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataInfoDirty();
    }


    /**
     * Set skipped IDs for the layer.
     * @param {number[]} ids - The IDs to skip.
     */
    public setSkippedIds(ids: number[]): void {
        // If id is already in skippedIds, remove it (i.e., toggle it off)
        ids.forEach(id => {
            if(this._skippedIds.has(id)) {
                this._skippedIds.delete(id);
            }
            else {
                this._skippedIds.add(id);
            }
        });

        const toggled = new Set<number>();
        for (const id of ids) {
            if (id < 0) continue;

            const sTriangle = id > 0 ? this._components[id - 1].nTriangles : 0;
            const eTriangle = this._components[id].nTriangles;

            for (let i = 3 * sTriangle; i < 3 * eTriangle; i++) {
                const vertexIndex = this._indices[i];

                if (!toggled.has(vertexIndex)) {
                    this._skippedVertices[vertexIndex] = 1 - this._skippedVertices[vertexIndex];
                    toggled.add(vertexIndex);
                }
            }
        }

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataInfoDirty();
    }


    /**
     * Aggregate thematic data for point level.
     * @param {ILayerThematic} layerThematic - The thematic data to aggregate.
     * @returns {number[]} - The aggregated thematic data.
     */
    private aggregateThematicPoint(layerThematic: ILayerThematic): number[] {
        return layerThematic.values;
    }

    /**
     * Aggregate thematic data for primitive level.
     * @param {number} component - The component index.
     * @param {ILayerThematic} layerThematic - The thematic data to aggregate.
     * @returns {number[]} - The aggregated thematic data.
     */
    private aggregateThematicPrimitive(component: number, layerThematic: ILayerThematic): number[] {
        // component points: start/end indices and number of points
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        // component triangles: start/end indices
        const sTriangle = component > 0 ? this._components[component - 1].nTriangles : 0;
        const eTriangle = this._components[component].nTriangles;

        const thematic = new Array(nPoint);

        for (let id = 3 * sTriangle; id < 3 * eTriangle; id++) {
            const vid = this._indices[id] - sPoint;
            const tid = Math.floor(id / 3) - sTriangle;

            thematic[vid] = layerThematic.values[tid];
        }

        return thematic;
    }

    /**
     * Aggregate thematic data for component level.
     * @param {number} component - The component index.
     * @param {ILayerThematic} layerThematic - The thematic data to aggregate.
     * @returns {number[]} - The aggregated thematic data.
     */
    private aggregateThematicComponenet(component: number, layerThematic: ILayerThematic): number[] {
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Array(nPoint);

        for (let vId = 0; vId < nPoint; vId++) {
            thematic[vId] = layerThematic.values[0];
        }

        return thematic;
    }
}