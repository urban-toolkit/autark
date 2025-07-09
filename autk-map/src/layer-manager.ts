import { IBoundingBox, ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';
import { LayerGeometryType } from './constants';


import { Feature, Polygon } from 'geojson';
import { polygon } from '@turf/turf';

import { Layer } from './layer';
import { FeaturesLayer } from './layer-features';
import { BuildingsLayer } from './layer-buildings';
import { BordersLayer } from './layer-borders';

export class LayerManager {
    protected _origin: number[] = [];
    protected _bbox!: Feature<Polygon>;
    protected _layers: Layer[] = [];

    constructor() { }

    get layers(): Layer[] {
        return this._layers;
    }

    get length(): number {
        return this._layers.length;
    }

    get origin(): number[] {
        return this._origin;
    }

    get boundingBox(): Feature<Polygon> {
        return this._bbox;
    }

    updateBoundingBoxAndOrigin(bbox: IBoundingBox) {
        this._origin = [(bbox.maxLon + bbox.minLon) * 0.5, (bbox.maxLat + bbox.minLat) * 0.5, 0];

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

    addLayer(layerInfo: ILayerInfo, layerRender: ILayerRenderInfo, layerData: ILayerData): Layer | null {
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

    delLayer(layerInfo: ILayerInfo): void {
        // searches the layer
        for (let lId = 0; lId < this._layers.length; lId++) {
            const lay = this._layers[lId];
            if (lay.id === layerInfo.id) {
                this.layers.splice(lId, 1);
            }
        }
    }

    searchByLayerInfo(layerInfo: ILayerInfo): Layer | null {
        // searches the layer
        let layer = null;
        for (const lay of this.layers) {
            if (lay.id === layerInfo.id) {
                layer = lay;
                break;
            }
        }
        return layer;
    }

    searchByLayerId(layerId: string): Layer | null {
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
