import { LayerData, LayerInfo, LayerRenderInfo } from './layer-types';

import { Camera, LayerBorder, LayerBorderComponent } from './core-types';
import { Renderer } from './renderer';

import { VectorLayer } from './layer-vector';
import { PipelineTriangleBorder } from './pipeline-triangle-border';

/**
 * Triangles2DLayer extends VectorLayer to handle rendering of 2D triangles with optional borders.
 * It manages triangle positions, indices, and border geometry with separate rendering pipelines.
 */
export class Triangles2DLayer extends VectorLayer {
    /**
     * Positions of the borders.
     * @type {number[]}
     */
    protected _borderPos!: number[];

    /**
     * IDs of the borders.
     * @type {number[]}
     */
    protected _borderIds!: number[];

    /**
     * Components of the layer.
     * @type {LayerComponent[]}
     */
    protected _borderComponents: LayerBorderComponent[] = [];

    /**
     * Pipeline for rendering borders.
     * @type {PipelineTriangleBorder}
     */
    protected _pipelineBorder!: PipelineTriangleBorder;

    /**
     * Tracks whether border geometry data is out of sync with GPU buffers.
     * @type {boolean}
     */
    protected _borderDataIsDirty: boolean = false;

    /**
     * Constructor for Triangles2DLayer.
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData);
        this.loadLayerData(layerData);
    }

    /**
     * Get the readonly border positions.
     * @returns {readonly number[]} - The positions of the borders.
     */
    get borderPos(): readonly number[] {
        return this._borderPos;
    }

    /**
     * Get the readonly border indices.
     * @returns {readonly number[]} - The indices of the borders.
     */
    get borderIds(): readonly number[] {
        return this._borderIds;
    }

    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        this._pipelineBorder = new PipelineTriangleBorder(renderer);
        this._pipelineBorder.build(this);
    }

    /**
     * Load the layer data, specifically the border information.
     * @param {LayerData} layerData - The data associated with the layer.
     */
    loadLayerData(layerData: LayerData): void {
        super.loadLayerData(layerData);

        this.loadBorderGeometry(layerData.border || []);
        this.loadBorderComponent(layerData.borderComponents || []);
    }

    /**
     * Load the border geometry data for the layer.
     * Validates that border data is consistent and marks GPU buffers as dirty.
     * @param {LayerBorder[]} border - The border geometry data to load.
     */
    loadBorderGeometry(border: LayerBorder[]): void {
        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < border.length; id++) {
            const borderData = border[id];

            // Validate positions and indices dimensions
            if (borderData.position.length % 2 !== 0) {
                console.warn(`Border ${id}: position array length is not even (got ${borderData.position.length})`);
            }
            if (!borderData.indices || borderData.indices.length === 0) {
                console.warn(`Border ${id}: no indices provided`);
            }

            // Calculate index offset based on current position count
            const offsetVertices = position.length / 2;
            borderData.indices.forEach((idx) => {
                if (idx < 0 || idx >= borderData.position.length / 2) {
                    console.warn(`Border ${id}: index ${idx} out of bounds [0, ${borderData.position.length / 2})`);
                }
                indices.push(idx + offsetVertices);
            });

            // Merge position data
            position.push(...borderData.position);
        }

        this._borderPos = position;
        this._borderIds = indices;
        this._borderDataIsDirty = true;
    }

    /**
     * Load the border components for the layer.
     * @param {LayerBorderComponent[]} borderComponent - The border components to load.
     */
    loadBorderComponent(borderComponent: LayerBorderComponent[]): void {
        this._borderComponents = [];

        const accum = { nPoints: 0, nLines: 0 };
        for (let cId = 0; cId < borderComponent.length; cId++) {
            const comp = borderComponent[cId];

            accum.nPoints += comp.nPoints;
            accum.nLines += comp.nLines;

            this._borderComponents.push({
                nPoints: accum.nPoints,
                nLines: accum.nLines
            });
        }
    }

    /**
     * Render the layer for the current pass.
     * Syncs border GPU buffers if data has changed, then renders borders.
     * @param {Camera} camera - The camera instance.
     */
    renderPass(camera: Camera): void {
        super.renderPass(camera);

        // Skip if no border data
        if (this._borderPos.length === 0 || this._borderIds.length === 0) {
            return;
        }

        // Update GPU buffers if border geometry changed
        if (this._borderDataIsDirty) {
            this._pipelineBorder.updateVertexBuffers(this);
            this._borderDataIsDirty = false;
        }

        this._pipelineBorder.updateZIndex(this._layerInfo.zIndex);
        this._pipelineBorder.renderPass(camera);
    }

    /** Releases GPU resources for base and border pipelines. */
    override destroy(): void {
        super.destroy();
        this._pipelineBorder?.destroy();
    }
}