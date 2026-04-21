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
 * 2D Triangles layer class.
 * Inherits from VectorLayer and provides additional methods for handling border geometry.
 */
export class Triangles2DLayer extends VectorLayer {
    /**
     * Border positions of the triangles.
     * @type {Float32Array}
     */
    protected _borderPosition: Float32Array = new Float32Array(0);

    /**
     * Border indices of the triangles.
     * @type {Uint32Array}
     */
    protected _borderIndices: Uint32Array = new Uint32Array(0);

    /**
     * Border components of the layer.
     * @type {LayerBorderComponent[]}
     */
    protected _borderComponents: LayerBorderComponent[] = [];

    /**
     * Rendering pipeline for the border.
     * @type {PipelineTriangleBorder}
     */
    protected _pipelineBorder!: PipelineTriangleBorder;

    /**
     * Creates a 2D triangles layer.
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo, layerData, 2);
        // Field initializers run after super() and overwrite data set during the
        // polymorphic loadLayerData call inside VectorLayer.constructor.
        // Re-load border data explicitly so it is available for createPipeline.
        this.loadBorderGeometry(layerData.border ?? []);
        this.loadBorderComponent(layerData.borderComponents ?? []);
    }

    /**
     * Gets the border positions of the triangles.
     * @returns {Float32Array} The border positions.
     */
    get borderPosition(): Float32Array {
        return this._borderPosition;
    }

    /**
     * Gets the border indices of the triangles.
     * @returns {Uint32Array} The border indices.
     */
    get borderIndices(): Uint32Array {
        return this._borderIndices;
    }

    /**
     * Gets the border components of the layer.
     * @returns {LayerBorderComponent[]} The border components.
     */
    get borderComponents(): LayerBorderComponent[] {
        return this._borderComponents;
    }

    /**
     * Loads the layer data, including border geometry and components.
     * @param {LayerData} layerData - The layer data to load.
     */
    override loadLayerData(layerData: LayerData): void {
        super.loadLayerData(layerData);

        this.loadBorderGeometry(layerData.border ?? []);
        this.loadBorderComponent(layerData.borderComponents ?? []);
    }

    /**
     * Load the border geometry data for the layer.
     * @param {LayerBorder[]} border - The border geometry data to load.
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
     * Loads the border components of the layer.
     * @param {LayerBorderComponent[]} borderComponents - The border components to load.
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
     * Creates the rendering pipeline for the layer, including the border pipeline.
     * @param {Renderer} renderer - The renderer instance.
     */
    override createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        if (this._borderPosition.length > 0) {
            this._pipelineBorder = new PipelineTriangleBorder(renderer);
            this._pipelineBorder.build(this);
        }
    }

    /**
     * Renders the layer for the current pass, including the border.
     * @param {Camera} camera - The camera instance.
     */
    override renderPass(camera: Camera): void {
        // VectorLayer.renderPass() clears dirty flags after updating the main
        // fill/picking pipelines, so preserve the data-dirty state needed to
        // keep the border buffers in sync for skip/geometry changes.
        const dataDirty = this._dataIsDirty;

        super.renderPass(camera);

        if (!this._pipelineBorder) { return; }

        if (dataDirty) {
            this._pipelineBorder.updateVertexBuffers(this);
        }

        this._pipelineBorder.updateZIndex(this._layerInfo.zIndex);
        this._pipelineBorder.renderPass(camera);
    }

    /** Releases GPU resources owned by 2D pipelines. */
    override destroy(): void {
        super.destroy();
        this._pipelineBorder?.destroy();
    }
}
