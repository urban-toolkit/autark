import { Camera } from './camera';
import { ILayerComponent, ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Renderer } from './renderer';

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
     * Indicates if the layer's data information is dirty.
     * This is used to determine if VOBs need to be reconstructed.
     * @type {boolean}
     */
    protected _dataInfoIsDirty: boolean = false;

    /**
     * Highlighted IDs of the layer.
     * This is a set to ensure uniqueness of highlighted IDs.
     * @type {Set<number>}
     */
    protected _highlightedIds!: Set<number>;

    /**
     * Highlighted vertices of the layer.
     * @type {number[]}
     */
    protected _highlightedVertices!: number[];

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
     * Gets the ID of the layer.
     * @returns {string} The ID of the layer.
     */
    get id(): string {
        return this._layerInfo.id;
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
     * Gets the picked components of the layer.
     * @returns {number[] | undefined} The picked components, or undefined if not set.
     */
    get pickedComp(): number[] | undefined {
        return this.layerRenderInfo.pickedComps;
    }

    /**
     * Gets the IDs of the highlighted components in the layer.
     * @returns {number[]} The highlighted IDs.
     */
    get highlightedIds(): number[] {
        return Array.from(this._highlightedIds);
    }

    /**
     * Gets the highlighted vertices of the layer.
     * @returns {number[]} The highlighted vertices.
     */
    get highlightedVertices(): number[] {
        return this._highlightedVertices;
    }

    /**
     * Marks the layer's data as dirty, indicating that VOBs need to be reconstructed.
     */
    public makeLayerDataInfoDirty() {
        this._dataInfoIsDirty = true;
    }

    /**
     * Marks the layer's rendering information as dirty, indicating uniforms need to be reloaded.
     */
    public makeLayerRenderInfoDirty() {
        this._renderInfoIsDirty = true;
    }

    /**
     * Clears the highlighted components of the layer.
     */
    public clearHighlightedIds() {
        this._highlightedVertices.fill(0);
        this._highlightedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataInfoDirty();
    }

    /**
     * Sets the highlighted IDs of the layer.
     * @param {number[]} ids - The IDs to highlight.
     */
    abstract setHighlightedIds(ids: number[]): void;

    /**
     * Loads the data for the layer.
     * @param {ILayerData} layerData - The data to load into the layer.
     */
    abstract loadData(layerData: ILayerData): void;

    /**
     * Loads the geometry for the layer.
     * @param {ILayerGeometry[]} layerGeometry - The geometries to load into the layer.
     */
    abstract loadGeometry(layerGeometry: ILayerGeometry[]): void;

    /**
     * Loads the component for the layer.
     * @param {ILayerComponent[]} layerComponent - The components to load into the layer.
     */
    abstract loadComponent(layerComponent: ILayerComponent[]): void;

    /**
     * Loads the thematic data for the layer.
     * @param {ILayerThematic[]} layerThematic - The thematic data to load into the layer.
     */
    abstract loadThematic(layerThematic: ILayerThematic[]): void;

    /**
     * Creates the rendering pipeline for the layer.
     * @param {Renderer} renderer - The renderer to use for the layer.
     * @param {Camera} camera - The camera to use for the layer.
     */
    abstract createPipeline(renderer: Renderer, camera: Camera): void;

    /**
     * Renders the layer.
     * @param {Camera} camera - The camera to use for rendering.
     */
    abstract renderPass(camera: Camera): void;

    /**
     * Renders the picking pass for the layer.
     * @param {Camera} camera - The camera to use for the picking pass.
     */
    abstract renderPickingPass(camera: Camera): void;

    /**
     * Gets the picked ID at the specified coordinates.
     * @param {number} x - The x-coordinate.
     * @param {number} y - The y-coordinate.
     * @returns {Promise<number>} A promise that resolves to the picked ID.
     */
    abstract getPickedId(x: number, y: number): Promise<number>;
}
