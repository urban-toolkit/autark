import { 
    LayerInfo,
    LayerRenderInfo,
    LayerData,
    LayerGeometry,
    LayerComponent,
} from "./layer-types";

import { Layer } from "./layer";

import {
    Camera,
    ColorMap,
    DEFAULT_TRANSFER_FUNCTION,
    buildTransferContext,
    computeAlphaByte,
} from 'autk-core';
import type { TransferFunction, RequiredTransferFunction } from 'autk-core';
import { Renderer } from "./renderer";

import { Pipeline } from "./pipeline";
import { PipelineTriangleRaster } from "./pipeline-triangle-raster";

export class RasterLayer extends Layer {
    /**
     * Positions of the triangles.
     * @type {number[]}
     */
    protected _position!: number[];

    /**
     * Indices of the triangles.
     * @type {number[]}
     */
    protected _indices!: number[];

    /**
     * The texture coordinates for the layer.
     * @type {number[]}
     */
    protected _texCoord!: number[];

    /**
     * Components of the layer.
     * @type {LayerComponent[]}
     */
    protected _components: LayerComponent[] = [];

    /**
     * The raster resolution in X direction.
     * @type {number}
     */
    protected _rasterResX!: number;

    /**
     * The raster resolution in Y direction.
     * @type {number}
     */
    protected _rasterResY!: number;

    /**
     * The raster data for the layer.
     * @type {RasterData}
     */
    protected _rasterData!: number[];

    /** Opacity transfer-function configuration used while rebuilding raster RGBA data. */
    protected _transferFunction: RequiredTransferFunction = { ...DEFAULT_TRANSFER_FUNCTION };

    /**
        * Pipeline used to render raster layers.
     */
    protected _pipeline!: Pipeline;

    /**
     * Constructor for Raster
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {LayerData} layerData - The layer data.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo);

        this.loadLayerData(layerData);
    }

    /**
     * Get the positions of the triangles.
     * @returns {number[]} - The positions of the triangles.
     */
    get position(): number[] {
        return this._position;
    }

    /**
     * Get the indices of the triangles.
     * @returns {number[]} - The indices of the triangles.
     */
    get indices(): number[] {
        return this._indices;
    }

    /**
     * Get the texture coordinates.
     * @returns {number[]} - The texture coordinates.
     */
    get texCoord(): number[] {
        return this._texCoord;
    }

    /**
     * Get the components of the layer.
     * @returns {LayerComponent[]} - The components of the layer.
     */
    get components(): LayerComponent[] {
        return this._components;
    }

    /**
     * Get the raster resolution in X direction.
     * @returns {number} - The raster resolution in X direction.
     */
    get rasterResX(): number {
        return this._rasterResX;
    }

    /**
     * Get the raster resolution in Y direction.
     * @returns {number} - The raster resolution in Y direction.
     */
    get rasterResY(): number {
        return this._rasterResY;
    }

    /**
     * Get the raster data.
     * @returns {RasterData} - The raster data.
     */
    get rasterData(): number[] {
        return this._rasterData;
    }

    /**
     * Updates the transfer-function configuration used to map scalar values to opacity.
     */
    setTransferFunction(config: TransferFunction): void {
        this._transferFunction = {
            ...this._transferFunction,
            ...config,
        };
    }

    /**
     * Load the layer data.
     * @param {LayerData} layerData - The layer data.
     */
    loadLayerData(layerData: LayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);

        if (layerData.rasterResX !== undefined && layerData.rasterResY !== undefined) {
            this._rasterResX = layerData.rasterResX;
            this._rasterResY = layerData.rasterResY;
        }

        if (layerData.raster && layerData.raster.length) {
            this.loadRaster(layerData.raster);
        }
    }

    /**
     * Load the texture coordinates from the layer data.
     * @param {LayerGeometry[]} layerGeometry - The layer data.
     */
    loadGeometry(layerGeometry: LayerGeometry[]): void {
        const position: number[] = [];
        const indices: number[] = [];
        const texCoord: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            layerGeometry[id].indices?.forEach((a) => {
                const b = a + position.length / 2;
                indices.push(b);
            });

            // merges the position data
            layerGeometry[id].position.forEach((d) => {
                position.push(d);
            });

            // merges the texture coordinate data
            layerGeometry[id].texCoord?.forEach((d) => {
                texCoord.push(d);
            });
        }

        // Raster triangles are expected to be 2D vertices and 2D UV pairs.
        console.assert(position.length % 2 === 0, 'Raster geometry position length must be a multiple of 2.');
        console.assert(texCoord.length % 2 === 0, 'Raster geometry texCoord length must be a multiple of 2.');
        console.assert(position.length === texCoord.length, 'Raster geometry and texCoord arrays should have matching lengths.');
        
        this._position = position;
        this._indices = indices;
        this._texCoord = texCoord;
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
     * Load raster values and rebuild the texture.
     * @param rasterValues Flattened raster values to colorize.
     */
    loadRaster(rasterValues: number[]): void {
        const rasterData: number[] = [];

        if (!rasterValues || rasterValues.length === 0) {
            return;
        }

        const isRGBA = rasterValues.length === this._rasterResX * this._rasterResY * 4;
        if (!isRGBA) {
            const validValues = rasterValues.filter(v => !isNaN(v));
            const transferContext = buildTransferContext(validValues, this._transferFunction);

            if (transferContext.validCount === 0) {
                rasterValues.forEach(() => {
                    rasterData.push(0, 0, 0, 0);
                });
                this._rasterData = rasterData;
                return;
            }

            rasterValues.forEach((d) => {
                if (isNaN(d)) {
                    rasterData.push(0, 0, 0, 0);
                    return;
                }

                const color = ColorMap.getColor(d, this._layerRenderInfo.colorMapInterpolator, [transferContext.min, transferContext.max]);
                const alpha = computeAlphaByte(d, transferContext);

                rasterData.push(color.r);
                rasterData.push(color.g);
                rasterData.push(color.b);
                rasterData.push(alpha);
            });
        }
        else {
            rasterValues.forEach((d) => {
                rasterData.push(d);
            });
        }

        this._rasterData = rasterData;
    }

    /**
     * Create the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer instance.
     */
    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineTriangleRaster(renderer);
        this._pipeline.build(this);
    }

    /**
     * Render the layer for the current pass.
     * @param {Camera} camera - The camera instance.
     */
    renderPass(camera: Camera): void {
        if (this._dataIsDirty) {
            const rasterPipeline = this._pipeline as PipelineTriangleRaster;
            rasterPipeline.updateVertexBuffers(this);
            rasterPipeline.updateRasterUniforms(this);
            this._dataIsDirty = false;
        }

        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        this._pipeline.updateZIndex(this._layerInfo.zIndex);
        this._pipeline.renderPass(camera);
    }

    /** Releases GPU resources owned by the raster pipeline. */
    override destroy(): void {
        this._pipeline?.destroy();
    }
}
 