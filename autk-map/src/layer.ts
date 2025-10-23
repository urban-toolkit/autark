import {
    ILayerInfo,
    ILayerRenderInfo
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
     * @type {ILayerInfo}
     */
    protected _layerInfo!: ILayerInfo;

    /**
     * Layer rendering information.
     * @type {ILayerRenderInfo}
     */
    protected _layerRenderInfo!: ILayerRenderInfo;

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
     * @param {ILayerInfo} layerInfo - The layer information.
     * @param {ILayerRenderInfo} layerRenderInfo - The layer render information.
     */
    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
        this._layerInfo = layerInfo;
        this._layerRenderInfo = layerRenderInfo;
    }

    /**
     * Gets the information of the layer.
     * @returns {string} The information of the layer.
     */
    get layerInfo(): ILayerInfo {
        return this._layerInfo;
    }

    /**
     * Sets the information of the layer.
     * @param {ILayerInfo} layerInfo - The info to set for the layer.
     */
    set layerInfo(layerInfo: ILayerInfo) {
        this._layerInfo = layerInfo;
    }

    /**
     * Gets the rendering information of the layer.
     * @returns {ILayerRenderInfo} The rendering information of the layer.
     */
    get layerRenderInfo(): ILayerRenderInfo {
        return this._layerRenderInfo;
    }

    /**
     * Sets the rendering information of the layer.
     * @param {ILayerRenderInfo} layerRenderInfo - The rendering info to set for the layer.
     */
    set layerRenderInfo(layerRenderInfo: ILayerRenderInfo) {
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
