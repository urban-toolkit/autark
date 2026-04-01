import { Camera } from 'autk-core';
import { LayerInfo, LayerRenderInfo } from './interfaces';
import { Renderer } from './renderer';

/**
 * Base class for map layers.
 *
 * Defines the contract for rendering, pipeline creation, and picking so that
 * all layer types can be stored and iterated uniformly.
 */
export abstract class Layer {
    protected _layerInfo!: LayerInfo;
    protected _layerRenderInfo!: LayerRenderInfo;
    protected _renderInfoIsDirty: boolean = false;
    protected _dataIsDirty: boolean = false;

    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo) {
        this._layerInfo = layerInfo;
        this._layerRenderInfo = layerRenderInfo;
    }

    get layerInfo(): LayerInfo { return this._layerInfo; }
    set layerInfo(layerInfo: LayerInfo) { this._layerInfo = layerInfo; }

    get layerRenderInfo(): LayerRenderInfo { return this._layerRenderInfo; }
    set layerRenderInfo(layerRenderInfo: LayerRenderInfo) { this._layerRenderInfo = layerRenderInfo; }

    makeLayerDataDirty(): void { this._dataIsDirty = true; }
    makeLayerRenderInfoDirty(): void { this._renderInfoIsDirty = true; }

    /** Initializes the GPU pipeline for this layer. */
    abstract createPipeline(renderer: Renderer): void;

    /** Executes the normal render pass for this layer. */
    abstract renderPass(camera: Camera): void;

    /**
     * Executes the picking render pass. No-op for layers that do not support picking.
     */
    renderPickingPass(_camera: Camera): void {}

    /**
     * Reads the picked feature ID at the given canvas coordinates.
     * Returns `-1` for layers that do not support picking.
     */
    getPickedId(_x: number, _y: number): Promise<number> {
        return Promise.resolve(-1);
    }

    /**
     * Clears all highlighted features. No-op for layers that do not support highlighting.
     */
    clearHighlightedIds(): void {}
}
