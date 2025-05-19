import { IBoundingBox, ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';
import { LayerGeometryType } from './constants';

import { Layer } from './layer';
import { Features2DLayer } from './layer-features2D';
import { BuildingsLayer } from './layer-buildings';

import { Feature, Polygon } from 'geojson';
import { polygon } from '@turf/turf';

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
        this._origin = [
            (bbox.maxLat + bbox.minLat) * 0.5,
            (bbox.maxLon + bbox.minLon) * 0.5,
            0
        ];

        console.log('clat', (bbox.maxLat + bbox.minLat) * 0.5, -8239012.438994927);
        console.log('clon', (bbox.maxLon + bbox.minLon) * 0.5,  4941135.512524911);

        // this._origin = [
        //     -8239012.438994927,
        //      4941135.512524911,
        //     0
        // ];

        const xmin = (bbox.minLat - this._origin[0]) * 1.1;
        const xmax = (bbox.maxLat - this._origin[0]) * 1.1;
        const ymin = (bbox.minLon - this._origin[1]) * 1.1;
        const ymax = (bbox.maxLon - this._origin[1]) * 1.1;

        this._bbox =
            polygon([
                [
                    [xmin, ymin],
                    [xmin, ymax],
                    [xmax, ymax],
                    [xmax, ymin],
                    [xmin, ymin]
                ]
            ]);

    }

    addLayer(layerInfo: ILayerInfo, layerRender: ILayerRenderInfo, layerData: ILayerData): Layer | null {
        let layer = null;

        // loads based on type
        switch (layerInfo.typeGeometry) {
            case LayerGeometryType.FEATURES_2D:
                layer = new Features2DLayer(layerInfo, layerRender, layerData);
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
