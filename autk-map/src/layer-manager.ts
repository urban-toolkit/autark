import { 
    BBox
} from 'geojson';

import { 
    ILayerData,
    ILayerInfo,
    ILayerRenderInfo
} from './interfaces';

import { Layer } from './layer';
import { LayerType } from './constants';
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
     * List of layers in the map.
     * @type {Layer[]}
     */
    protected _layers: Layer[] = [];

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
     * Get the layers of the map.
     * @returns {Layer[]} - The list of layers.
     */
    get layers(): Layer[] {
        return this._layers;
    }

    /**
     * Get the number of layers.
     * @returns {number} - The number of layers.
     */
    get length(): number {
        return this._layers.length;
    }

    /**
     * Get the origin of the map.
     * @returns {number[]} - The origin coordinates in meters.
     */
    get origin(): number[] {
        return this._origin
    }

    /**
     * Set the origin of the map.
     * @param {number[]} origin - The origin coordinates in meters.
     */
    set origin(origin: number[]) {
        this._origin = origin;
    }

    /**
     * Get the bounding box of the map.
     * @returns {BBox} - The bounding box as a GeoJSON polygon.
     */
    get boundingBox(): BBox {
        return this._bbox;
    }

    /**
     * Set the bounding box of the map.
     * TODO: Receive a Feature<Polygon> instead of IBoundingBox
     * @param {BBox} bbox - The bounding box to set.
     */
    set boundingBox(bbox: BBox) {
        this.origin = [(bbox[2] + bbox[0]) * 0.5, (bbox[3] + bbox[1]) * 0.5];

        const xmin = (bbox[0] - this._origin[0]) * 1.05;
        const xmax = (bbox[2] - this._origin[0]) * 1.05;
        const ymin = (bbox[1] - this._origin[1]) * 1.05;
        const ymax = (bbox[3] - this._origin[1]) * 1.05;

        this._bbox = [xmin, ymin, xmax, ymax];
    }

    /**
     * Adds a layer to the map.
     * @param {ILayerInfo} layerInfo - The information about the layer.
     * @param {ILayerRenderInfo} layerRender - The rendering information for the layer.
     * @param {ILayerData} layerData - The data associated with the layer.
     * @returns {Layer | null} - The created layer or null if the type is unknown.
     */
    public addLayer(layerInfo: ILayerInfo, layerRender: ILayerRenderInfo, layerData: ILayerData): Layer | null {
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
            this._layers.push(layer);
            this._layers.sort((a, b) => a.layerInfo.zValue - b.layerInfo.zValue);

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
        for (let lId = 0; lId < this._layers.length; lId++) {
            const lay = this._layers[lId];
            if (lay.id === layerId) {
                this.layers.splice(lId, 1);
                break;
            }
        }
    }

    /**
     * Searches for a layer by its ID.
     * @param {string} layerId - The ID of the layer to search for.
     * @returns {Layer | null} - The found layer or null if not found.
     */
    public searchByLayerId(layerId: string): Layer | null {
        // searches the layer
        let layer = null;
        for (const lay of this.layers) {
            if (lay.id === layerId) {
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
    public computeLayerZindex(layerType: LayerType): number {
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
