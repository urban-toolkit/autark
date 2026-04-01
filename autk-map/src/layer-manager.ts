import { BBox } from 'geojson';

import { LayerData, LayerInfo, LayerRenderInfo } from './interfaces';
import { LayerType } from './constants';
import { Layer } from './layer';
import { RasterLayer } from './layer-raster';
import { Triangles3DLayer } from './layer-triangles3D';
import { Triangles2DLayer } from './layer-triangles2D';

/**
 * Manages all map layers as a single ordered list.
 */
export class LayerManager {
    protected _layers: Layer[] = [];
    protected _bbox!: BBox;
    protected _origin!: number[];

    get layers(): Layer[] { return this._layers; }

    get origin(): number[] { return this._origin; }

    get bboxAndOrigin(): BBox { return this._bbox; }
    set bboxAndOrigin(bbox: BBox) {
        this._bbox = bbox;
        this._origin = [
            (bbox[2] + bbox[0]) * 0.5,
            (bbox[3] + bbox[1]) * 0.5,
        ];
    }

    /**
     * Creates and registers a layer based on `layerInfo.typeLayer`.
     * Returns the created layer, or `null` if the type is unrecognised.
     */
    addLayer(layerInfo: LayerInfo, layerRender: LayerRenderInfo, layerData: LayerData): Layer | null {
        let layer: Layer | null = null;

        switch (layerInfo.typeLayer) {
            case 'buildings':
                layer = new Triangles3DLayer(layerInfo, layerRender, layerData);
                break;
            case 'raster':
                layer = new RasterLayer(layerInfo, layerRender, layerData);
                break;
            default:
                layer = new Triangles2DLayer(layerInfo, layerRender, layerData);
                break;
        }

        if (layer) {
            this._layers.push(layer);
            this._layers.sort((a, b) => a.layerInfo.zIndex - b.layerInfo.zIndex);
        }

        return layer;
    }

    /** Removes the first layer matching `layerId`. */
    delLayer(layerId: string): void {
        const idx = this._layers.findIndex(l => l.layerInfo.id === layerId);
        if (idx !== -1) this._layers.splice(idx, 1);
    }

    /** Removes all layers matching `layerId`. */
    removeLayerById(layerId: string): void {
        this._layers = this._layers.filter(l => l.layerInfo.id !== layerId);
    }

    /** Returns the layer with the given `layerId`, or `null` if not found. */
    searchByLayerId(layerId: string): Layer | null {
        return this._layers.find(l => l.layerInfo.id === layerId) ?? null;
    }

    /** Computes the z-index for a given layer type. */
    computeZindex(layerType: LayerType): number {
        switch (layerType) {
            case 'surface':   return 0;
            case 'parks':     return 0.1;
            case 'water':     return 0.2;
            case 'roads':     return 0.3;
            case 'raster':    return 0.4;
            case 'polygons':  return 0.5;
            case 'polylines': return 0.6;
            case 'points':    return 0.7;
            case 'buildings': return 1.0;
            default:          return 0;
        }
    }
}
