import {
    LayerInfo,
    LayerRenderInfo
} from './interfaces';

/**
 * Base class for map layers.
 * This class provides the basic structure and functionality for all map layers.
 * 
 * It includes methods for loading data, geometry, components, and thematic data,
 * as well as rendering and picking operations.
*/
export abstract class Layer {
    /**
     * Layer information.
     * @type {LayerInfo}
     */
    protected _layerInfo!: LayerInfo;

    /**
     * Layer rendering information.
     * @type {LayerRenderInfo}
     */
    protected _layerRenderInfo!: LayerRenderInfo;

    /**
     * Indicates if the layer's rendering information is dirty.
     * This is used to determine if uniforms need to be reloaded.
     * @type {boolean}
     */
    protected _renderInfoIsDirty: boolean = false;

    /**
     * Indicates if the layer's data is dirty.
     * This is used to determine if VOBs need to be reconstructed.
     * @type {boolean}
     */
    protected _dataIsDirty: boolean = false;

    /**
     * Constructor for Layer
     * @param {LayerInfo} layerInfo - The layer information.
     * @param {LayerRenderInfo} layerRenderInfo - The layer render information.
     */
    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo) {
        this._layerInfo = layerInfo;
        this._layerRenderInfo = layerRenderInfo;
    }

    /**
     * Gets the information of the layer.
     * @returns {string} The information of the layer.
     */
    get layerInfo(): LayerInfo {
        return this._layerInfo;
    }

    /**
     * Sets the information of the layer.
     * @param {LayerInfo} layerInfo - The info to set for the layer.
     */
    set layerInfo(layerInfo: LayerInfo) {
        this._layerInfo = layerInfo;
    }

    /**
     * Gets the rendering information of the layer.
     * @returns {LayerRenderInfo} The rendering information of the layer.
     */
    get layerRenderInfo(): LayerRenderInfo {
        return this._layerRenderInfo;
    }

    /**
     * Sets the rendering information of the layer.
     * @param {LayerRenderInfo} layerRenderInfo - The rendering info to set for the layer.
     */
    set layerRenderInfo(layerRenderInfo: LayerRenderInfo) {
        this._layerRenderInfo = layerRenderInfo;
    }

    /**
     * Marks the layer's data as dirty, indicating that VOBs need to be reconstructed.
     */
    public makeLayerDataDirty() {
        this._dataIsDirty = true;
    }

    /**
     * Marks the layer's rendering information as dirty, indicating uniforms need to be reloaded.
     */
    public makeLayerRenderInfoDirty() {
        this._renderInfoIsDirty = true;
    }
}
