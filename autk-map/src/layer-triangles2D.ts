import { ILayerBorder, ILayerBorderComponent, ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { VectorLayer } from './layer-vector';
import { PipelineTriangleBorder } from './pipeline-triangle-border';

/**
 * Triangles2DBorder class extends Triangles2DLayer to handle rendering of borders in 2D triangles layers.
 * It manages the border positions and indices, and creates a specific rendering pipeline for borders.
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
     * @type {ILayerComponent[]}
     */
    protected _borderComponents: ILayerBorderComponent[] = [];

    /**
     * Pipeline for rendering borders.
     * @type {PipelineTriangleBorder}
     */
    protected _pipelineBorder!: PipelineTriangleBorder;



    /**
     * Constructor for Triangles2DBorder
     * @param {ILayerInfo} layerInfo - The layer information.
     * @param {ILayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {ILayerData} layerData - The layer data.
     * @param {number} dimension - The dimension of the layer (2 or 3).
     */
    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData, dimension: number = 2) {
        super(layerInfo, layerRenderInfo, layerData);
        this._dimension = dimension;

        this.loadLayerData(layerData);
    }



    /**
     * Get the border positions.
     * @returns {number[]} - The positions of the borders.
     */
    get borderPos(): number[] {
        return this._borderPos;
    }

    /**
     * Get the border IDs.
     * @returns {number[]} - The IDs of the borders.
     */
    get borderIds(): number[] {
        return this._borderIds;
    }



    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    public createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        this._pipelineBorder = new PipelineTriangleBorder(renderer);
        this._pipelineBorder.build(this);
    }

    /**
     * Load the layer data, specifically the border information.
     * @param {ILayerData} layerData - The data associated with the layer.
     */
    public loadLayerData(layerData: ILayerData): void {
        super.loadLayerData(layerData);

        this.loadBorderGeometry(layerData.border || []);
        this.loadBorderComponent(layerData.borderComponents || []);
    }



    /**
     * Load the border geometry data for the layer.
     * @param {ILayerBorder[]} border - The border geometry data to load.
     */
    public loadBorderGeometry(border: ILayerBorder[]): void {
        const borders = border;

        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < borders.length; id++) {
            // fix the index count
            borders[id].indices.forEach((a) => {
                const b = a + position.length / 3;
                indices.push(b);
            });

            // merges the position data
            borders[id].position.forEach((d, id) => {
                position.push(d);

                if (id % 2 === 1) {
                    const z = this._layerInfo.zIndex;
                    position.push(z);
                }
            });
        }

        this._borderPos = position;
        this._borderIds = indices;

    }

    /**
     * Load the border components for the layer.
     * @param {ILayerBorderComponent[]} borderComponent - The border components to load.
     */
    public loadBorderComponent(borderComponent: ILayerBorderComponent[]): void {
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
     * @param {Camera} camera - The camera instance.
     */
    public renderPass(camera: Camera): void {
        super.renderPass(camera);

        if (this._borderPos.length === 0 ||
            this._borderIds.length === 0 ||
            this._borderComponents.length === 0) {
            return;
        }
        this._pipelineBorder.renderPass(camera);
    }
}