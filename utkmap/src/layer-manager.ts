import { ILayerData } from "./interfaces";
import { LayerGeometryType } from "./constants";

import Layer from "./layer";
import TrianglesLayer from "./layer-triangles";

export default class LayerManager {
    protected _layers: Layer[] = [];

    constructor() {
    }

    get layers(): Layer[] {
        return this._layers;
    }

    createLayer(layerInfo: ILayerData): Layer | null {
        let layer = null;

        // loads based on type
        switch (layerInfo.type) {
            case LayerGeometryType.TRIGMESH_LAYER:
                layer = new TrianglesLayer(layerInfo);
            break;
            default:
                console.error(`File ${layerInfo.id}.json has an unknown layer type: ${layerInfo.type}.`);
            break;
        }

        if (layer) { 
            this._layers.push(<Layer>layer);
            return <Layer>layer;
        }
        return null;
    }
}