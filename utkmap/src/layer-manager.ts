import { ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';
import { LayerGeometryType } from './constants';

import { Layer } from './layer';
import { Features2DLayer } from './layer-features2D';
import { BuildingsLayer } from './layer-buildings';

export class LayerManager {
    protected _layers: Layer[] = [];

    constructor() { }

    get layers(): Layer[] {
        return this._layers;
    }

    get length(): number {
        return this._layers.length;
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
