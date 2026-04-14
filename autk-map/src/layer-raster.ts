import { 
    LayerInfo,
    LayerRenderInfo,
    LayerData,
} from "./types-layers";

import { Layer } from "./layer";

import {
    Camera,
    LayerGeometry,
    LayerComponent,
    ColorMap,
    DEFAULT_TRANSFER_FUNCTION,
    buildTransferContext,
    computeAlphaByte,
} from './types-core';

import type { 
    TransferFunction,
    RequiredTransferFunction
} from './types-core';

import { Renderer } from "./renderer";

import { Pipeline } from "./pipeline";
import { PipelineTriangleRaster } from "./pipeline-triangle-raster";

export class RasterLayer extends Layer {
    /**
     * Positions of the triangles.
     * @type {Float32Array}
     */
    protected _position!: Float32Array;

    /**
     * Indices of the triangles.
     * @type {Uint32Array}
     */
    protected _indices!: Uint32Array;

    /**
     * The texture coordinates for the layer.
     * @type {Float32Array}
     */
    protected _texCoord!: Float32Array;

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
     * @type {Float32Array}
     */
    protected _rasterData!: Float32Array;

    /** Canonical scalar raster payload used for domain recomputation. */
    protected _rasterValues: Float32Array = new Float32Array(0);

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
     * @returns {Float32Array} - The positions of the triangles.
     */
    get position(): Float32Array {
        return this._position;
    }

    /**
     * Get the indices of the triangles.
     * @returns {Uint32Array} - The indices of the triangles.
     */
    get indices(): Uint32Array {
        return this._indices;
    }

    /**
     * Get the texture coordinates.
     * @returns {Float32Array} - The texture coordinates.
     */
    get texCoord(): Float32Array {
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
     * @returns {Float32Array} - The raster data.
     */
    get rasterData(): Float32Array {
        return this._rasterData;
    }

    /** Original scalar raster values (not normalized). */
    get rasterValues(): Float32Array {
        return this._rasterValues;
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
        let totalVerts = 0;
        let totalIndices = 0;
        let totalTexCoords = 0;

        for (const g of layerGeometry) {
            totalVerts += g.position.length;
            totalIndices += (g.indices?.length ?? 0);
            totalTexCoords += (g.texCoord?.length ?? 0);
        }

        const position = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);
        const texCoord = new Float32Array(totalTexCoords);

        let vOffset = 0;
        let iOffset = 0;
        let tOffset = 0;
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

            if (g.texCoord) {
                texCoord.set(g.texCoord, tOffset);
                tOffset += g.texCoord.length;
            }

            vOffset += g.position.length;
            vertexCount += g.position.length / 2; // Raster is always 2D
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
    loadRaster(rasterValues: Float32Array): void {
        if (!rasterValues || rasterValues.length === 0) {
            return;
        }

        this._rasterValues = rasterValues;

        const isRGBA = rasterValues.length === this._rasterResX * this._rasterResY * 4;
        const rasterData = new Float32Array(isRGBA ? rasterValues.length : this._rasterResX * this._rasterResY * 4);

        if (!isRGBA) {
            const validValues: number[] = [];
            for (let i = 0; i < rasterValues.length; i++) {
                if (!isNaN(rasterValues[i])) validValues.push(rasterValues[i]);
            }

            const colorDomain = this._layerRenderInfo.colormap.computedDomain;
            const numericDomain = (
                Array.isArray(colorDomain)
                && colorDomain.length > 0
                && colorDomain.every(v => typeof v === 'number')
            )
                ? colorDomain as [number, number] | [number, number, number]
                : null;

            const transferValues = numericDomain
                ? validValues.filter(v => v >= numericDomain[0] && v <= numericDomain[numericDomain.length - 1])
                : validValues;

            const transferContext = buildTransferContext(
                transferValues.length > 0 ? transferValues : validValues,
                this._transferFunction,
            );

            if (transferContext.validCount === 0) {
                rasterData.fill(0);
                this._rasterData = rasterData;
                return;
            }

            for (let i = 0; i < rasterValues.length; i++) {
                const d = rasterValues[i];
                const offset = i * 4;
                if (isNaN(d)) {
                    rasterData[offset] = 0;
                    rasterData[offset + 1] = 0;
                    rasterData[offset + 2] = 0;
                    rasterData[offset + 3] = 0;
                    continue;
                }

                const effectiveDomain = numericDomain ?? [transferContext.min, transferContext.max] as [number, number];

                const color = ColorMap.getColor(
                    d,
                    this._layerRenderInfo.colormap.config.interpolator,
                    effectiveDomain,
                );
                const alpha = computeAlphaByte(d, transferContext);

                rasterData[offset] = color.r;
                rasterData[offset + 1] = color.g;
                rasterData[offset + 2] = color.b;
                rasterData[offset + 3] = alpha;
            }
        }
        else {
            rasterData.set(rasterValues);
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
