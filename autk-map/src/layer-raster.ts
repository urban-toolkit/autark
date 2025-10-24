import { 
    ILayerInfo,
    ILayerRenderInfo,
    ILayerData,
    ILayerGeometry,
    ILayerComponent,
    IRasterData
} from "./interfaces";

import { Layer } from "./layer";

import { Camera } from "./camera";
import { Renderer } from "./renderer";

import { Pipeline } from "./pipeline";
import { PipelineTriangleRaster } from "./pipeline-triangle-raster";
import { ColorMap } from "./colormap";

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
     * @type {ILayerComponent[]}
     */
    protected _components: ILayerComponent[] = [];



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
     * @type {IRasterData}
     */
    protected _rasterData!: number[];



    /**
     * Pipeline for rendering borders.
     * @type {PipelineTriangleBorder}
     */
    protected _pipeline!: Pipeline;



    /**
     * Constructor for Raster
     * @param {ILayerInfo} layerInfo - The layer information.
     * @param {ILayerRenderInfo} layerRenderInfo - The layer render information.
     * @param {ILayerData} layerData - The layer data.
     */
    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
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
     * @returns {ILayerComponent[]} - The components of the layer.
     */
    get components(): ILayerComponent[] {
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
     * @returns {IRasterData} - The raster data.
     */
    get rasterData(): number[] {
        return this._rasterData;
    }



    /**
     * Load the layer data.
     * @param {ILayerData} layerData - The layer data.
     */
    public loadLayerData(layerData: ILayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);

        if (layerData.raster && layerData.raster.length) {
            this.loadRaster(layerData.raster);
        }
    }

    /**
     * Load the texture coordinates from the layer data.
     * @param {ILayerData} layerData - The layer data.
     */
    public loadGeometry(layerGeometry: ILayerGeometry[]): void {
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
     * Load the raster data from the layer data.
     * @param {ILayerData} layerData - The layer data.
     */
    public loadRaster(layerRaster: IRasterData[]): void {
        const rasterData: number[] = [];

        for (let id = 0; id < layerRaster.length; id++) {
            const layer = layerRaster[id];

            if (!layer.rasterValues) {
                continue;
            }

            if (this._rasterResX === undefined) {
                this._rasterResX = layer.rasterResX;
            }
            if (this._rasterResY === undefined) {
                this._rasterResY = layer.rasterResY;
            }

            const isRGBA = layer.rasterValues.length === layer.rasterResX * layer.rasterResY * 4;
            if (!isRGBA) {
                const min = Math.min(...layer.rasterValues);
                const max = Math.max(...layer.rasterValues);
                const range = max - min;

                layer.rasterValues.forEach((d) => {
                    const t = (d - min) / range;
                    const color = ColorMap.getColor(t, this._layerRenderInfo.colorMapInterpolator);

                    rasterData.push(color.r);
                    rasterData.push(color.g);
                    rasterData.push(color.b);
                    rasterData.push(255);
                });
            }
            else {
                layer.rasterValues.forEach((d) => {
                    rasterData.push(d);
                });
            }

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
        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        this._pipeline.renderPass(camera);
    }
}
 