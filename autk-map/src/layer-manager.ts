/**
 * @module LayerManager
 * Layer ordering and shared-origin management for map layers.
 *
 * This module defines the `LayerManager` class, which owns the registered layer
 * list, computes the shared scene origin used by geometry loaders, and enforces
 * the render-stack ordering rules for base OSM layers, dynamic layers, and
 * buildings. It also creates the concrete layer implementation that matches each
 * layer type and handles layer insertion and removal lifecycle.
 */

import { FeatureCollection, Geometry } from 'geojson';

import { resolveCollectionBounds, computeOrigin, OSM_BASE_LAYER_ORDER } from '@urban-toolkit/autk-core';
import type { LayerType } from '@urban-toolkit/autk-core';
import type { MapBounds } from './api';

import { 
    LayerData, 
    LayerInfo, 
    LayerRenderInfo
} from './types-layers';

import { Layer } from './layer';
import { RasterLayer } from './layer-raster';
import { mergeCredits } from './attribution';
import type { TileCredit } from './attribution';
import { TileLayer } from './layer-tiles';
import type { TileLayerOptions } from './layer-tiles';
import { Triangles3DLayer } from './layer-triangles3D';
import { Triangles2DLayer } from './layer-triangles2D';
import { SpriteLayer } from './layer-sprite';
import { PolylineLayer } from './layer-polyline';

/**
 * Manages all map layers as a single ordered list.
 *
 * `LayerManager` stores every registered layer in render order, computes the
 * shared local origin from the first loaded collection, and maintains the
 * default order by type and insertion. A custom order rearranges 2D layers;
 * buildings still render in a separate 3D pass.
 */
export class LayerManager {
    /** Registered layers sorted by render order. */
    protected _layers: Layer[] = [];
    /** World-space origin derived from the bounding box center. */
    protected _origin?: number[];
    /** World-space bounds of the collection that set the origin. */
    protected _bounds?: MapBounds;

    /** Registered layers in the order they were added. */
    private _added: Layer[] = [];

    /** Layer ids in the order a caller set, bottom first; empty for the order by type. */
    private _order: string[] = [];

    /** Registered layers in the order they are drawn, bottom first. */
    get layers(): Layer[] { return this._layers; }

    /** World-space origin derived from the current bounding box center. */
    get origin(): number[] {
        if (!this._origin) {
            throw new Error('Layer origin has not been initialized');
        }
        return this._origin;
    }

    /** Indicates whether the shared scene origin has been initialized. */
    get hasOrigin(): boolean { return this._origin !== undefined; }

    /**
     * World-space bounds `[minX, minY, maxX, maxY]` of the collection that set the origin, or `undefined` before one
     * is loaded or when it had no coordinates.
     */
    get bounds(): MapBounds | undefined { return this._bounds; }

    /**
     * Computes the shared scene origin from the provided collection.
     *
     * @param collection Source feature collection.
     * @returns Nothing. Updates the manager's shared origin, and the bounds that go with it, in place.
     * @throws Never throws.
     */
    initializeOrigin(collection: FeatureCollection<Geometry | null>): void {
        this._origin = computeOrigin(collection as FeatureCollection);
        const box = resolveCollectionBounds(collection);
        this._bounds = box ? [box.minLon, box.minLat, box.maxLon, box.maxLat] : undefined;
    }

    /**
     * Creates, registers, and reorders a layer based on `layerInfo.typeLayer`.
     *
     * @param layerInfo Layer identity and type metadata.
     * @param layerRender Initial render configuration.
     * @param layerData Geometry and auxiliary layer payload.
     * @returns The created layer, or `null` if a layer with the same id is already registered.
     * @throws Never throws. Duplicate ids log an error and return `null`.
     */
    addLayer(layerInfo: LayerInfo, layerRender: LayerRenderInfo, layerData: LayerData): Layer | null {
        if (this._hasLayerId(layerInfo.id)) { return null; }

        const layer: Layer = layerInfo.typeLayer === 'buildings'
            ? new Triangles3DLayer(layerInfo, layerRender, layerData)
            : layerInfo.typeLayer === 'raster'
                ? new RasterLayer(layerInfo, layerRender, layerData)
                : layerInfo.typeLayer === 'points'
                    ? new SpriteLayer(layerInfo, layerRender, layerData)
                    : layerData.polylineAttributes
                        ? new PolylineLayer(layerInfo, layerRender, layerData)
                        : new Triangles2DLayer(layerInfo, layerRender, layerData);

        return this._register(layer);
    }

    /**
     * Adds a tile layer.
     *
     * By default, tile layers sit below every other layer, in load order.
     *
     * @param layerInfo Layer identity; `typeLayer` must be `'tiles'`.
     * @param layerRender Initial render configuration.
     * @param options Tile source and tuning.
     * @returns The created layer, or `null` when the id is already used.
     * @throws If the tile source is invalid.
     */
    addTileLayer(layerInfo: LayerInfo, layerRender: LayerRenderInfo, options: TileLayerOptions): TileLayer | null {
        if (this._hasLayerId(layerInfo.id)) { return null; }
        const layer = new TileLayer(layerInfo, layerRender, options, () => this._origin);
        return this._register(layer);
    }

    /** Reports a duplicate id on the console and returns whether the id is taken. */
    private _hasLayerId(id: string): boolean {
        const taken = this._layers.some((layer) => layer.layerInfo.id === id);
        if (taken) { console.error(`LayerManager: layer id '${id}' already exists.`); }
        return taken;
    }

    private _register<L extends Layer>(layer: L): L {
        this._added.push(layer);
        this._rebuildLayerOrder();

        return layer;
    }

    /**
     * Sets the order the layers are drawn in, bottom first.
     *
     * The layers listed are drawn in this order, and the others keep their
     * order, with as few layers moved past others as can be: the rule is in
     * `applyLayerOrder`. Buildings are drawn with depth wherever they are, so
     * the order leaves them out. An id whose layer is not registered yet takes
     * its place when it is. An empty list returns to the order by type.
     *
     * @param ids Layer ids, bottom first.
     * @returns Nothing. Updates {@link layers}.
     * @throws Never throws.
     */
    setLayerOrder(ids: string[]): void {
        this._order = [...new Set(ids)];
        this._rebuildLayerOrder();
    }

    /**
     * Removes the layer matching `layerId` and rebuilds the stack.
     *
     * @param layerId Layer identifier to remove.
     * @returns Nothing. Unknown ids are silently ignored.
     * @throws Never throws.
     */
    removeLayerById(layerId: string): void {
        const layer = this.searchByLayerId(layerId);
        if (!layer) {
            return;
        }

        layer.setChangeListener(null);
        layer.destroy();
        this._added = this._added.filter((candidate) => candidate.layerInfo.id !== layerId);
        this._rebuildLayerOrder();
    }

    /**
     * Returns the layer with the given `layerId`, or `null` if not found.
     *
     * @param layerId Layer identifier to search for.
     * @returns The matching layer instance, or `null`.
     * @throws Never throws.
     */
    searchByLayerId(layerId: string): Layer | null {
        return this._layers.find(l => l.layerInfo.id === layerId) ?? null;
    }

    /**
     * Credits of the tile layers that are drawn, without repeats. A hidden or
     * removed layer is no longer credited.
     *
     * @returns Credits in layer order.
     */
    visibleAttribution(): TileCredit[] {
        return mergeCredits(
            this._layers
                .filter((layer): layer is TileLayer => layer instanceof TileLayer && !layer.layerRenderInfo.isSkip)
                .map((layer) => layer.attribution),
        );
    }

    /** Rebuilds the default stack, keeping insertion order within each type slot. */
    private _rebuildLayerOrder(): void {
        const priority = (type: LayerType) => {
            if (type === 'tiles') return -1;
            const index = OSM_BASE_LAYER_ORDER.indexOf(type);
            return index < 0 ? OSM_BASE_LAYER_ORDER.length : index;
        };
        const byType = [...this._added].sort((a, b) => priority(a.layerInfo.typeLayer) - priority(b.layerInfo.typeLayer));
        this._layers = this._order.length === 0 ? byType : applyLayerOrder(byType, this._order);
    }
}

/**
 * Rearranges a stack in the order by type so the layers an order lists are drawn in that order.
 *
 * The layers the order does not list keep their order among themselves. Of the stacks that keep
 * both orders, this is the one that reverses the fewest pairs of layers compared with the order
 * by type, and of those, the one where each listed layer is as low as it can be. Buildings are
 * drawn with depth wherever they are, so the order leaves them out and they keep their places.
 *
 * @param byType Layers in the order by type, bottom first.
 * @param order Distinct layer ids, bottom first. Ids of layers not in the stack are ignored.
 * @returns The layers in the order they are drawn, bottom first.
 */
function applyLayerOrder(byType: Layer[], order: readonly string[]): Layer[] {
    const flat = byType.filter((layer) => !(layer instanceof Triangles3DLayer));
    const listed = order.map((id) => flat.find((layer) => layer.layerInfo.id === id)).filter((layer) => layer !== undefined);
    const others = flat.filter((layer) => !listed.includes(layer));
    // Pairs of listed layers follow the order and the others keep theirs, so the fewest pairs are
    // reversed when the listed layers move past the fewest of the others.
    const overByType = listed.map((layer) => others.filter((other) => flat.indexOf(other) < flat.indexOf(layer)).length);
    const over = fewestPasses(overByType, others.length);
    const drawn = others.flatMap((other, k) => [...listed.filter((_, n) => over[n] === k), other]);
    drawn.push(...listed.filter((_, n) => over[n] === others.length));
    let next = 0;
    return byType.map((layer) => (layer instanceof Triangles3DLayer ? layer : drawn[next++]));
}

/**
 * Places listed layers among the other layers, keeping them in their order and moving them past
 * as few of the others as it can.
 *
 * @param overByType For each listed layer, in the order, how many of the others it is drawn
 * over by type.
 * @param others How many other layers there are.
 * @returns For each listed layer, how many of the others it is drawn over: never fewer than the
 * layer before it, with the fewest passes in all, and each as low as it can be.
 */
function fewestPasses(overByType: readonly number[], others: number): number[] {
    // passes[n][k]: the fewest passes of listed layers 0 to n with layer n drawn over k others;
    // `before` holds the fewest passes of the layers before it, none of them over more than k.
    const passes: number[][] = [];
    overByType.forEach((from, n) => {
        let before = n === 0 ? 0 : Infinity;
        passes.push(Array.from({ length: others + 1 }, (_, k) => {
            if (n > 0) { before = Math.min(before, passes[n - 1][k]); }
            return Math.abs(k - from) + before;
        }));
    });
    // From the top listed layer down: the lowest choice with the fewest passes, no higher than the layer above.
    const over = new Array<number>(overByType.length);
    let limit = others;
    for (let n = overByType.length - 1; n >= 0; n--) {
        const row = passes[n].slice(0, limit + 1);
        limit = row.indexOf(Math.min(...row));
        over[n] = limit;
    }
    return over;
}
