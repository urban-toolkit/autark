import { Camera } from './types-core';
import { LayerInfo, LayerRenderInfo } from './types-layers';
import { Renderer } from './renderer';

/**
 * Base class for map layers.
 *
 * Defines the contract for rendering, pipeline creation, and picking so that
 * all layer types can be stored and iterated uniformly.
 */
export abstract class Layer {
    /** Static layer identity and ordering metadata. */
    protected _layerInfo: LayerInfo;
    /** Mutable rendering state used by pipeline uniforms and interaction flags. */
    protected _layerRenderInfo: LayerRenderInfo;
    /** Indicates that render-state uniforms must be refreshed on the GPU. */
    protected _renderInfoIsDirty = false;
    /** Indicates that geometry/data buffers must be refreshed on the GPU. */
    protected _dataIsDirty = false;

    /**
     * Creates a base layer instance.
     * @param layerInfo Layer identity and z-order metadata.
     * @param layerRenderInfo Initial render configuration.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo) {
        this._layerInfo = layerInfo;
        this._layerRenderInfo = layerRenderInfo;
    }

    /** Whether this layer supports picking interactions. */
    get supportsPicking(): boolean { return false; }

    /** Whether this layer supports feature highlighting. */
    get supportsHighlight(): boolean { return false; }

    /** Layer identity and z-order metadata. */
    get layerInfo(): LayerInfo { return this._layerInfo; }

    /** Current render configuration and interaction flags. */
    get layerRenderInfo(): LayerRenderInfo { return this._layerRenderInfo; }

    /**
     * Updates layer metadata and marks geometry-dependent resources dirty.
     * @param info Partial metadata patch to merge into `layerInfo`.
     */
    updateLayerInfo(info: Partial<LayerInfo>): void {
        this._layerInfo = { ...this._layerInfo, ...info };
        this.makeLayerDataDirty();
    }

    /**
     * Updates render metadata and marks render uniforms dirty.
     * @param info Partial render-state patch to merge into `layerRenderInfo`.
     */
    updateLayerRenderInfo(info: Partial<LayerRenderInfo>): void {
        const canPick = this.supportsPicking && this.supportsHighlight;
        const nextInfo: Partial<LayerRenderInfo> = { ...info };

        // Keep picking state coherent with layer capabilities.
        if ('isPick' in nextInfo && nextInfo.isPick === true && !canPick) {
            nextInfo.isPick = false;
            nextInfo.pickedComps = undefined;
        }

        this._layerRenderInfo = { ...this._layerRenderInfo, ...nextInfo };
        this.makeLayerRenderInfoDirty();
    }

    /** Marks layer data buffers as stale for the next render pass. */
    makeLayerDataDirty(): void { this._dataIsDirty = true; }

    /** Marks render uniforms/state as stale for the next render pass. */
    makeLayerRenderInfoDirty(): void { this._renderInfoIsDirty = true; }

    /**
     * Initializes GPU resources and pipeline objects for this layer.
     * @param renderer Active renderer instance.
     */
    abstract createPipeline(renderer: Renderer): void;

    /**
     * Executes the regular render pass for this layer.
     * @param camera Active camera used to compute view/projection transforms.
     */
    abstract renderPass(camera: Camera): void;

    /**
     * Executes the picking render pass. No-op for layers that do not support picking.
     * @param _camera Active camera used to compute view/projection transforms.
     */
    renderPickingPass(_camera: Camera): void {}

    /**
     * Reads the picked feature ID at the given canvas coordinates.
     * Returns `-1` for layers that do not support picking.
     * @param _x Canvas X coordinate in device pixels.
     * @param _y Canvas Y coordinate in device pixels.
     * @returns Promise with the picked feature id, or `-1` when unsupported.
     */
    getPickedId(_x: number, _y: number): Promise<number> {
        return Promise.resolve(-1);
    }

    /**
     * Clears all highlighted features. No-op for layers that do not support highlighting.
     */
    clearHighlightedIds(): void {}

    /**
     * Releases resources owned by this layer.
     * Override in subclasses that allocate GPU resources.
     */
    destroy(): void {}
}
