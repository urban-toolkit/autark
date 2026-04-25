/**
 * @module Layer
 * Base abstractions for map-layer lifecycle and rendering.
 *
 * This module defines the abstract `Layer` class used by the map renderer to
 * manage heterogeneous layer implementations through a common interface. It
 * centralizes shared layer metadata, mutable render-state tracking, dirty-flag
 * handling, and the lifecycle hooks subclasses implement for pipeline creation,
 * rendering, picking, highlighting, and cleanup.
 */

import { Camera } from './types-core';
import { LayerInfo, LayerRenderInfo } from './types-layers';
import { Renderer } from './renderer';

/**
 * Base class for map layers.
 *
 * `Layer` provides the shared metadata and lifecycle surface used by the layer
 * manager and renderer to work with different layer implementations in a
 * uniform way.
 *
 * Subclasses are responsible for creating GPU resources, executing render
 * passes, and optionally supporting picking and highlighting. The base class
 * also tracks whether layer data or render-state changes require GPU-side
 * synchronization before the next draw.
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
     *
     * @param layerInfo Layer identity and z-order metadata.
     * @param layerRenderInfo Initial render configuration.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo) {
        this._layerInfo = layerInfo;
        this._layerRenderInfo = layerRenderInfo;
    }

    /**
     * Indicates whether this layer supports picking interactions.
     *
     * Subclasses override this when they implement a picking pass and expose
     * stable component ids that can be resolved back to features.
     *
     * @returns `true` when picking is supported for this layer.
     */
    get supportsPicking(): boolean { return false; }

    /**
     * Indicates whether this layer supports feature highlighting.
     *
     * Highlight support is used together with picking and explicit highlight
     * updates to control per-feature emphasis during rendering.
     *
     * @returns `true` when highlight state can be updated for this layer.
     */
    get supportsHighlight(): boolean { return false; }

    /**
     * Layer identity and ordering metadata.
     *
     * @returns The current layer metadata object.
     */
    get layerInfo(): LayerInfo { return this._layerInfo; }

    /**
     * Current render configuration and interaction flags.
     *
     * @returns The current mutable render-state object for this layer.
     */
    get layerRenderInfo(): LayerRenderInfo { return this._layerRenderInfo; }

    /**
     * Updates layer metadata and marks geometry-dependent resources dirty.
     *
     * The provided values are shallow-merged into the existing `layerInfo`.
     * After the update, the layer is marked data-dirty so subclasses can rebuild
     * any GPU resources that depend on layer metadata before the next render.
     *
     * @param info Partial metadata patch to merge into `layerInfo`.
     * @returns Marks layer data as stale for the next render cycle.
     */
    updateLayerInfo(info: Partial<LayerInfo>): void {
        this._layerInfo = { ...this._layerInfo, ...info };
        this.makeLayerDataDirty();
    }

    /**
     * Updates render metadata and marks render uniforms dirty.
     *
     * The provided values are shallow-merged into the existing
     * `layerRenderInfo`. If picking is explicitly enabled on a layer that does
     * not support both picking and highlighting, the request is ignored by
     * forcing `isPick` back to `false` and clearing any provided
     * `pickedComps` value.
     *
     * @param info Partial render-state patch to merge into `layerRenderInfo`.
     * @returns Marks render-state uniforms as stale for the next render cycle.
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

    /**
     * Marks layer data buffers as stale for the next render pass.
     *
     * @returns Causes subclasses to refresh geometry- or data-dependent GPU
     * resources when they next render.
     */
    makeLayerDataDirty(): void { this._dataIsDirty = true; }

    /**
     * Marks render uniforms and render-state as stale for the next render pass.
     *
     * @returns Causes subclasses to refresh GPU-side render-state before the
     * next draw.
     */
    makeLayerRenderInfoDirty(): void { this._renderInfoIsDirty = true; }

    /**
     * Initializes GPU resources and pipeline objects for this layer.
     *
     * This is called once the renderer is available and should allocate any
     * pipeline state, buffers, bind groups, or other GPU resources required by
     * the concrete layer implementation.
     *
     * @param renderer Active renderer instance.
     * @returns Initializes the layer so it can participate in subsequent render
     * passes.
     */
    abstract createPipeline(renderer: Renderer): void;

    /**
     * Executes the regular render pass for this layer.
     *
     * Implementations should encode draw commands for the main shared render
     * pass using the current camera state and any synchronized layer resources.
     *
     * @param camera Active camera used to compute view/projection transforms.
     * @param passEncoder Render-pass encoder for the active main pass.
     * @returns Encodes this layer's draw commands into the provided render pass.
     */
    abstract renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void;

    /**
     * Runs any offscreen or prepass work required before the shared main pass.
     *
     * Subclasses can override this to perform preparation steps that must occur
     * before `renderPass`, such as updating intermediate render targets or other
     * camera-dependent precomputations.
     *
     * @param _camera Active camera used to compute view/projection transforms.
     * @returns Performs any layer-specific pre-render work. The base
     * implementation does nothing.
     */
    prepareRender(_camera: Camera): void {}

    /**
     * Executes the picking render pass.
     *
     * Layers that support picking can override this to render feature or
     * component ids into an offscreen target for hit-testing. The base
     * implementation is a no-op.
     *
     * @param _camera Active camera used to compute view/projection transforms.
     * @returns Renders picking data when supported. Otherwise does nothing.
     */
    renderPickingPass(_camera: Camera): void {}

    /**
     * Clears all highlighted features.
     *
     * Layers that support highlighting should override this to remove any
     * current highlight selection. The base implementation is a no-op.
     *
     * @returns Clears highlight state when supported. Otherwise does nothing.
     */
    clearHighlightedIds(): void {}

    /**
     * Replaces the highlighted feature selection.
     *
     * Layers that support highlighting should interpret the provided component
     * ids according to their own feature-to-component mapping. The base
     * implementation is a no-op.
     *
     * @param _ids Component ids to highlight.
     * @returns Updates highlight state when supported. Otherwise does nothing.
     */
    setHighlightedIds(_ids: number[]): void {}

    /**
     * Applies a skip mask to the provided component ids.
     *
     * Layers can override this to suppress rendering for selected components.
     * The base implementation is a no-op.
     *
     * @param _ids Component ids to skip during rendering.
     * @returns Updates the layer's skip mask when supported. Otherwise does
     * nothing.
     */
    setSkippedIds(_ids: number[]): void {}

    /**
     * Clears the skip mask.
     *
     * Layers that implement skipped-component handling should override this to
     * restore normal rendering for all components. The base implementation is a
     * no-op.
     *
     * @returns Clears skipped-component state when supported. Otherwise does
     * nothing.
     */
    clearSkippedIds(): void {}

    /**
     * Releases resources owned by this layer.
     *
     * Override in subclasses that allocate GPU resources.
     *
     * @returns Releases any layer-owned resources. The base implementation does
     * nothing.
     */
    destroy(): void {}
}
