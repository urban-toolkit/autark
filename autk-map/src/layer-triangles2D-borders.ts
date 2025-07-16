import { ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { Triangles2DLayer } from './layer-triangles2D';
import { PipelineBorderFlat } from './pipeline-border-flat';

/**
 * Triangles2DBorder class extends Triangles2DLayer to handle rendering of borders in 2D triangles layers.
 * It manages the border positions and indices, and creates a specific rendering pipeline for borders.
 */
export class Triangles2DBorder extends Triangles2DLayer {
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
     * Pipeline for rendering borders.
     * @type {PipelineBorderFlat}
     */
    protected _pipelineBorder!: PipelineBorderFlat;

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

        this.loadData(layerData);
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
    override createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        this._pipelineBorder = new PipelineBorderFlat(renderer);
        this._pipelineBorder.build(this);
    }

    /**
     * Load the layer data, specifically the border information.
     * @param {ILayerData} layerData - The data associated with the layer.
     */
    override loadData(layerData: ILayerData): void {
        super.loadData(layerData);

        const borders = layerData.border || [];

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

        this._borderPos = position;
        this._borderIds = indices;

    }

    /**
     * Render the layer for the current pass.
     * @param {Camera} camera - The camera instance.
     */
    override renderPass(camera: Camera): void {
        super.renderPass(camera);
        this._pipelineBorder.renderPass(camera);
    }
}