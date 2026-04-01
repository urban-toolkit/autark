import { 
    LayerInfo,
    LayerRenderInfo,
    LayerData,
    LayerGeometry,
    LayerComponent,
} from "./interfaces";

import { Layer } from "./layer";

import { Camera, ColorMap } from 'autk-core';
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



    /**
     * Pipeline for rendering borders.
     * @type {PipelineTriangleBorder}
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
     * Load the layer data.
     * @param {LayerData} layerData - The layer data.
     */
    public loadLayerData(layerData: LayerData): void {
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
    public loadGeometry(layerGeometry: LayerGeometry[]): void {
        const position: number[] = [];
        const indices: number[] = [];
        const texCoord: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            layerGeometry[id].indices?.forEach((a) => {
                const b = a + position.length / 3;
                indices.push(b);
            });

            // merges the position data
            layerGeometry[id].position.forEach((d, id) => {
                position.push(d);

                if (id % 2 === 1) {
                    const z = this._layerInfo.zIndex;
                    position.push(z);
                }
            });

            // merges the texture coordinate data
            layerGeometry[id].texCoord?.forEach((d) => {
                texCoord.push(d);
            });
        }
        
        this._position = position;
        this._indices = indices;
        this._texCoord = texCoord;
    }

    /**
     * Load the components of the layer.
     * @param {LayerComponent[]} layerComponents - The components to load.
     */
    public loadComponent(layerComponents: LayerComponent[]): void {
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
     * Load the raster data from the layer data.
     * @param {RasterData[]} layerRaster - The layer data.
     */
    /**
     * Load raster values and rebuild the texture.
     * @param rasterValues Flattened raster values to colorize.
     */
    public loadRaster(rasterValues: number[]): void {
        const rasterData: number[] = [];

        if (!rasterValues || rasterValues.length === 0) {
            return;
        }

        const isRGBA = rasterValues.length === this._rasterResX * this._rasterResY * 4;
        if (!isRGBA) {
            const min = rasterValues.reduce((a, b) => isNaN(b) ? a : Math.min(a, b), Infinity);
            const max = rasterValues.reduce((a, b) => isNaN(b) ? a : Math.max(a, b), -Infinity);
            const range = max - min;

            rasterValues.forEach((d) => {
                const color = ColorMap.getColor(d, this._layerRenderInfo.colorMapInterpolator, [min, max]);
                const t = range > 0 ? (d - min) / range : 0;
                const alpha = d <= 0 ? 0 : Math.max(0, Math.min(255, Math.round(t * 255)));

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
    public createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineTriangleRaster(renderer);
        this._pipeline.build(this);
    }

    /**
     * Render the layer for the current pass.
     * @param {Camera} camera - The camera instance.
     */
    public renderPass(camera: Camera): void {
        if (this._dataIsDirty) {
            (this._pipeline as PipelineTriangleRaster).updateRasterUniforms(this);
            this._dataIsDirty = false;
        }

        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        this._pipeline.renderPass(camera);
    }
}
 