import { 
    Feature,
    Polygon
} from 'geojson';

import {
    polygon
} from '@turf/turf';

import { 
    IBoundingBox,
    ILayerData,
    ILayerInfo,
    ILayerRenderInfo
} from './interfaces';

import { Layer } from './layer';
import { Triangles2DBorder } from './layer-triangles2D-borders';
import { Triangles2DLayer } from './layer-triangles2D';
import { Triangles3DLayer } from './layer-triangles3D';

import { LayerGeometryType } from './constants';

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
     * @type {Feature<Polygon>}
     */
    protected _bbox!: Feature<Polygon>;

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
     * @returns {Feature<Polygon>} - The bounding box as a GeoJSON polygon.
     */
    get boundingBox(): Feature<Polygon> {
        return this._bbox;
    }

    /**
     * Set the bounding box of the map.
     * TODO: Receive a Feature<Polygon> instead of IBoundingBox
     * @param {IBoundingBox} bbox - The bounding box to set.
     */
    set boundingBox(bbox: IBoundingBox) {
        this.origin = [(bbox.maxLon + bbox.minLon) * 0.5, (bbox.maxLat + bbox.minLat) * 0.5];

        const xmin = (bbox.minLon - this._origin[0]) * 1.05;
        const xmax = (bbox.maxLon - this._origin[0]) * 1.05;
        const ymin = (bbox.minLat - this._origin[1]) * 1.05;
        const ymax = (bbox.maxLat - this._origin[1]) * 1.05;

        this._bbox = polygon([
            [
                [xmin, ymin],
                [xmin, ymax],
                [xmax, ymax],
                [xmax, ymin],
                [xmin, ymin],
            ],
        ]);
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

        // loads based on type
        switch (layerInfo.typeGeometry) {
            case LayerGeometryType.BOUNDARIES_2D:
                layer = new Triangles2DBorder(layerInfo, layerRender, layerData);
                break;
            case LayerGeometryType.TRIANGLES_2D:
                layer = new Triangles2DLayer(layerInfo, layerRender, layerData);
                break;
            case LayerGeometryType.TRIANGLES_3D:
                layer = new Triangles3DLayer(layerInfo, layerRender, layerData);
                break;
            default:
                console.error(`File ${layerInfo.id}.json has an unknown layer geometry: ${layerInfo.typeGeometry}.`);
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
}
