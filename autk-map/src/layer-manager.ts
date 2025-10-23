import { 
    BBox
} from 'geojson';

import { 
    ILayerData,
    ILayerInfo,
    ILayerRenderInfo
} from './interfaces';

import { LayerType } from './constants';
import { RasterLayer } from './layer-raster';
import { VectorLayer } from './layer-vector';
import { Triangles3DLayer } from './layer-triangles3D';
import { Triangles2DLayer } from './layer-triangles2D';

/**
 * Manages the layers of the map.
 * 
 * This class provides methods to add, remove, and search for layers,
 * as well as to manage the bounding box of the map.
 */
export class LayerManager {
    /**
     * List of vector layers in the map.
     * @type {VectorLayer[]}
     */
    protected _vectorLayers: VectorLayer[] = [];

    /**
     * List of raster layers in the map.
     * @type {RasterLayer[]}
     */
    protected _rasterLayers: RasterLayer[] = [];

    /**
     * Bounding box of the map.
     * @type {BBox}
     */
    protected _bbox!: BBox;

    /**
     * Origin of the map.
     * @type {number[]}
     */
    protected _origin!: number[];

    /**
     * Constructor for LayerManager
     */
    constructor() {
        this._vectorLayers = [];
        this._rasterLayers = [];
    }

    /**
     * Get the vetor layers of the map.
     * @returns {Layer[]} - The list of layers.
     */
    get vectorLayers(): VectorLayer[] {
        return this._vectorLayers;
    }

    /**
     * Get the raster layers of the map.
     * @returns {Layer[]} - The list of layers.
     */
    get rasterLayers(): RasterLayer[] {
        return this._rasterLayers;
    }

    /**
     * Get the origin of the map.
     * @returns {number[]} - The origin coordinates in meters.
     */
    get origin(): number[] {
        return this._origin
    }

    /**
     * Get the bounding box of the map.
     * @returns {BBox} - The bounding box as a GeoJSON polygon.
     */
    get bboxAndOrigin(): BBox {
        return this._bbox;
    }

    /**
     * Set the origin and the bounding box of the map.
     * @param {BBox} bbox - The bounding box to set.
     */
    set bboxAndOrigin(bbox: BBox) {
        this._bbox = bbox;
        this._origin = [
            (bbox[2] + bbox[0]) * 0.5,
            (bbox[3] + bbox[1]) * 0.5
        ];
    }

    /**
     * Adds a layer to the map.
     * @param {ILayerInfo} layerInfo - The information about the layer.
     * @param {ILayerRenderInfo} layerRender - The rendering information for the layer.
     * @param {ILayerData} layerData - The data associated with the layer.
     * @returns {Layer | null} - The created layer or null if the type is unknown.
     */
    public addVectorLayer(layerInfo: ILayerInfo, layerRender: ILayerRenderInfo, layerData: ILayerData): VectorLayer | null {
        let layer = null;

        switch (layerInfo.typeLayer) {
            case LayerType.AUTK_OSM_BUILDINGS:
                layer = new Triangles3DLayer(layerInfo, layerRender, layerData);
                break;
            default:
                layer = new Triangles2DLayer(layerInfo, layerRender, layerData);
                break;
        }

        if (layer) {
            this._vectorLayers.push(layer);
            this._vectorLayers.sort((a, b) => a.layerInfo.zIndex - b.layerInfo.zIndex);

            return layer;
        }
        return null;
    }

    /**
     * Adds a raster layer to the map.
     * @param {ILayerInfo} layerInfo - The information about the layer.
     * @param {ILayerRenderInfo} layerRender - The rendering information for the layer.
     * @param {ILayerData} layerData - The data associated with the layer.
     * @returns {Layer | null} - The created layer or null if the type is unknown.
     */
    public addRasterLayer(layerInfo: ILayerInfo, layerRender: ILayerRenderInfo, layerData: ILayerData): RasterLayer | null {
        let layer = null;

        switch (layerInfo.typeLayer) {
            case LayerType.AUTK_RASTER:
                layer = new RasterLayer(layerInfo, layerRender, layerData);
                break;
        }

        if (layer) {
            this._rasterLayers.push(layer);
            this._rasterLayers.sort((a, b) => a.layerInfo.zIndex - b.layerInfo.zIndex);

            return layer;
        }
        return null;
    }

    /**
     * Removes a layer from the map.
     * @param {string} layerId - The ID of the layer to remove.
     */
    delLayer(layerId: string): void {
        // searches the layer
        for (let lId = 0; lId < this._vectorLayers.length; lId++) {
            const lay = this._vectorLayers[lId];
            if (lay.layerInfo.id === layerId) {
                this.vectorLayers.splice(lId, 1);
                return;
            }
        }

        // searches the layer
        for (let lId = 0; lId < this._rasterLayers.length; lId++) {
            const lay = this._rasterLayers[lId];
            if (lay.layerInfo.id === layerId) {
                this._rasterLayers.splice(lId, 1);
                return;
            }
        }
    }

    /**
     * Searches for a layer by its ID.
     * @param {string} layerId - The ID of the layer to search for.
     * @returns {Layer | null} - The found layer or null if not found.
     */
    public searchByLayerId(layerId: string): VectorLayer | RasterLayer | null {
        // searches the layer
        let layer = null;

        for (const lay of this.vectorLayers) {
            if (lay.layerInfo.id === layerId) {
                layer = lay;
                break;
            }
        }

        for (const lay of this.rasterLayers) {
            if (lay.layerInfo.id === layerId) {
                layer = lay;
                break;
            }
        }

        return layer;
    }

    /**
     * Computes the Z-index for a given layer type.
     * @param {LayerType} layerType - The type of the layer.
     * @returns {number} - The computed Z-index.
     */
    public computeZindex(layerType: LayerType): number {
        let zIndex = 0;
        
        switch (layerType) {
            case LayerType.AUTK_OSM_SURFACE:
                zIndex = 0;
                break;
            case LayerType.AUTK_OSM_PARKS:
                zIndex = 0.1;
                break;
            case LayerType.AUTK_OSM_WATER:
                zIndex = 0.2;
                break;
            case LayerType.AUTK_OSM_ROADS:
                zIndex = 0.3;
                break;
            case LayerType.AUTK_OSM_BUILDINGS:
                zIndex = 1.0;
                break;
            case LayerType.AUTK_RASTER:
                zIndex = 0.4;
                break;
            case LayerType.AUTK_GEO_POLYGONS:
                zIndex = 0.5;
                break;
            case LayerType.AUTK_GEO_POLYLINES:
                zIndex = 0.6;
                break;
            case LayerType.AUTK_GEO_POINTS:
                zIndex = 0.7;
                break;
        }

        return zIndex;
    }
}
