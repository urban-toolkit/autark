import { BBox, FeatureCollection, Geometry } from 'geojson';

import type { LayerType } from './types-core';
import { LayerData, LayerInfo, LayerRenderInfo } from './types-layers';

import { Layer } from './layer';
import { RasterLayer } from './layer-raster';
import { Triangles3DLayer } from './layer-triangles3D';
import { Triangles2DLayer } from './layer-triangles2D';
import { LayerBbox } from './layer-bbox';


/**
 * OSM base layer types with a fixed bottom-up render order.
 * 'buildings' is always rendered last; everything else goes here
 * and is ordered by load insertion.
 */
const OSM_BASE: LayerType[] = ['surface', 'parks', 'water', 'roads'];


/**
 * Manages all map layers as a single ordered list.
 */
export class LayerManager {
    /** Registered layers sorted by render order. */
    protected _layers: Layer[] = [];
    /** Bounding box of the loaded dataset. */
    protected _bbox!: BBox;
    /** World-space origin derived from the bounding box center. */
    protected _origin!: number[];

    /** Layer ids of non-OSM, non-buildings layers in insertion order. */
    private _dynamicOrder: string[] = [];

    /** Registered layers sorted by z-index. */
    get layers(): Layer[] { return this._layers; }

    /** World-space origin derived from the current bounding box center. */
    get origin(): number[] { return this._origin; }

    /** Bounding box of the loaded data `[minLon, minLat, maxLon, maxLat]`. */
    get bbox(): BBox { return this._bbox; }

    /**
     * Computes the bounding box from a collection and recomputes the derived origin.
     * Uses `collection.bbox` when available, otherwise computes it from geometry.
     * @param collection Source feature collection.
     */
    computeBboxAndOrigin(collection: FeatureCollection<Geometry | null>): void {
        const bbox = collection.bbox ?? LayerBbox.build(collection as FeatureCollection);
        this._bbox = bbox;
        this._origin = [
            (bbox[2] + bbox[0]) * 0.5,
            (bbox[3] + bbox[1]) * 0.5,
        ];
    }

    /**
        * Creates, registers, and reorders a layer based on `layerInfo.typeLayer`.
        * Dynamic layer z-indices are recomputed after insertion.
        * @param layerInfo Layer identity and type metadata.
        * @param layerRender Initial render configuration.
        * @param layerData Geometry and auxiliary layer payload.
        * @returns The created layer, or `null` if the type is not recognized.
     */
    addLayer(layerInfo: LayerInfo, layerRender: LayerRenderInfo, layerData: LayerData): Layer | null {
        const layer: Layer = layerInfo.typeLayer === 'buildings'
            ? new Triangles3DLayer(layerInfo, layerRender, layerData)
            : layerInfo.typeLayer === 'raster'
                ? new RasterLayer(layerInfo, layerRender, layerData)
                : new Triangles2DLayer(layerInfo, layerRender, layerData);

        if (!OSM_BASE.includes(layerInfo.typeLayer) && layerInfo.typeLayer !== 'buildings') {
            this._dynamicOrder.push(layerInfo.id);
        }
        this._layers.push(layer);
        this._recomputeZIndices();
        this._layers.sort((a, b) => a.layerInfo.zIndex - b.layerInfo.zIndex);

        return layer;
    }

    /**
     * Removes the first layer matching `layerId` and recomputes dynamic z-order.
     * @param layerId Layer identifier to remove.
     */
    delLayer(layerId: string): void {
        const idx = this._layers.findIndex(l => l.layerInfo.id === layerId);
        if (idx !== -1) {
            this._layers[idx].destroy();
            this._layers.splice(idx, 1);
        }
        this._dynamicOrder = this._dynamicOrder.filter(id => id !== layerId);
        this._recomputeZIndices();
    }

    /**
     * Removes all layers matching `layerId` and recomputes dynamic z-order.
     * @param layerId Layer identifier to remove.
     */
    removeLayerById(layerId: string): void {
        this._layers.forEach((layer) => {
            if (layer.layerInfo.id === layerId) {
                layer.destroy();
            }
        });
        this._layers = this._layers.filter(l => l.layerInfo.id !== layerId);
        this._dynamicOrder = this._dynamicOrder.filter(id => id !== layerId);
        this._recomputeZIndices();
    }

    /**
     * Returns the layer with the given `layerId`, or `null` if not found.
     * @param layerId Layer identifier to search for.
     */
    searchByLayerId(layerId: string): Layer | null {
        return this._layers.find(l => l.layerInfo.id === layerId) ?? null;
    }

    /**
     * Returns a preliminary z-index placeholder used when constructing `LayerInfo`.
     * The definitive value is assigned by `_recomputeZIndices` inside `addLayer`.
     * @param layerType Layer type to place in the render stack.
     * @returns Fixed base-slot index for OSM layers, otherwise `0` as a placeholder.
     */
    computeZindex(layerType: LayerType): number {
        const osmIdx = OSM_BASE.indexOf(layerType);
        return osmIdx !== -1 ? osmIdx : 0;
    }

    /**
     * Reassigns z-indices across all registered layers:
     * - OSM base types: fixed slots 0…N-1 (by `OSM_BASE` order)
     * - Dynamic layers: slots N, N+1, … in load-insertion order
     * - Buildings: always last (N + dynamic count)
     */
    private _recomputeZIndices(): void {
        const buildingsZ = OSM_BASE.length + this._dynamicOrder.length;

        for (const layer of this._layers) {
            const { typeLayer, id } = layer.layerInfo;
            const osmIdx = OSM_BASE.indexOf(typeLayer);

            if (osmIdx !== -1) {
                layer.layerInfo.zIndex = osmIdx;
            } else if (typeLayer === 'buildings') {
                layer.layerInfo.zIndex = buildingsZ;
            } else {
                layer.layerInfo.zIndex = OSM_BASE.length + this._dynamicOrder.indexOf(id);
            }
        }
    }
}
