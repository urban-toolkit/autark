import { 
    Feature,
    Polygon
} from 'geojson';

import { 
    polygon,
    centroid
} from '@turf/turf';

import { 
    IBoundingBox,
    ILayerData,
    ILayerInfo,
    ILayerRenderInfo
} from './interfaces';

import { Layer } from './layer';
import { BordersLayer } from './layer-borders';
import { FeaturesLayer } from './layer-features';
import { BuildingsLayer } from './layer-buildings';

import { LayerGeometryType } from './constants';

/**
 * Manages the layers of the map.
 * 
 * This class provides methods to add, remove, and search for layers,
 * as well as to manage the bounding box of the map.
 */
export class LayerManager {
    protected _layers: Layer[] = [];
    protected _bbox!: Feature<Polygon>;

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
        return centroid(this._bbox).geometry.coordinates;
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
     * @param {IBoundingBox} bbox - The bounding box to set.
     * @todo: Recive a Feature<Polygon> instead of IBoundingBox
     */
    set boundingBox(bbox: IBoundingBox) {
        const xmin = (bbox.minLon - (bbox.maxLon + bbox.minLon) * 0.5) * 1.05;
        const xmax = (bbox.maxLon - (bbox.maxLon + bbox.minLon) * 0.5) * 1.05;
        const ymin = (bbox.minLat - (bbox.maxLat + bbox.minLat) * 0.5) * 1.05;
        const ymax = (bbox.maxLat - (bbox.maxLat + bbox.minLat) * 0.5) * 1.05;

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
            case LayerGeometryType.BORDERS_2D:
                layer = new BordersLayer(layerInfo, layerRender, layerData);
                break;
            case LayerGeometryType.FEATURES_2D:
                layer = new FeaturesLayer(layerInfo, layerRender, layerData);
                break;
            case LayerGeometryType.FEATURES_3D:
                layer = new BuildingsLayer(layerInfo, layerRender, layerData);
                break;
            default:
                console.error(`File ${layerInfo.id}.json has an unknown layer geometry: ${layerInfo.typeGeometry}.`);
                break;
        }

        if (layer) {
            this._layers.push(layer);
            this._layers.sort((a, b) => a.layerInfo.zIndex - b.layerInfo.zIndex);

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
