/**
 * @module TileLayer
 * Map layer that draws web map tiles (satellite imagery, street maps).
 *
 * Each frame the layer selects the tiles the camera sees, asks the
 * {@link TileStore} for them, and draws what has loaded. A tile that is still
 * loading is drawn with its nearest loaded ancestor, so the map never shows
 * holes while the camera moves. The selection and the geometry live in pure
 * modules (`tile-selection`, `tile-frame`); this class only connects them to the
 * map camera and the GPU.
 */

import { Camera, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '@urban-toolkit/autk-core';

import type { TileCredit } from './attribution';
import { Layer } from './layer';
import { Renderer } from './renderer';
import type { LayerInfo, LayerRenderInfo } from './types-layers';
import { PipelineTiles, TILE_TEXTURE_BYTES_PER_PIXEL } from './pipeline-tiles';
import type { TileTexture } from './pipeline-tiles';
import { buildTileFrame } from './tile-frame';
import type { FrameTile, TileFrame } from './tile-frame';
import { fetchTileImage } from './tile-loader';
import { applyTileTheme } from './tile-theme';
import { isTileCrs, type TileCrs } from './tile-projection';
import { selectTiles } from './tile-selection';
import type { TileSelectionOptions } from './tile-selection';
import { resolveTileSource } from './tile-source';
import type { ResolvedTileSource, TileSource } from './tile-source';
import { TileStore } from './tile-store';

/** Options for a {@link TileLayer}. */
export interface TileLayerOptions extends TileSelectionOptions {
    /** Where the tiles come from. */
    source: TileSource;
    /** Coordinate system of the map. Defaults to `'EPSG:3395'`. */
    crs?: TileCrs;
    /** Tiles kept in memory. Defaults to 256. */
    maxCachedTiles?: number;
}

/** A snapshot of what a {@link TileLayer} is doing. Reading it changes nothing and asks for no frame. */
export interface TileLayerStats {
    /** Whether the layer is drawn. A hidden layer does no work. */
    visible: boolean;
    /** Zoom level of the last selection, or `null` when nothing was selected. */
    zoom: number | null;
    /**
     * Zoom level the last view asked for. Greater than `zoom` when the tile cap
     * lowered it, so tiles are drawn larger than one tile pixel per screen pixel
     * and look softer. `null` when nothing was selected.
     */
    wantedZoom: number | null;
    /** Tiles in the last selection. */
    selectedTiles: number;
    /** True when the selection was cut to the tile cap because even the source's lowest zoom needs more. */
    truncated: boolean;
    /** Selected tiles drawn with their own image. */
    readyTiles: number;
    /** Selected tiles drawn with an ancestor's image while their own loads. */
    fallbackTiles: number;
    /** Selected tiles with no image to draw yet. `ready + fallback + missing` equals `selectedTiles`. */
    missingTiles: number;
    /** Requests loading right now. */
    activeRequests: number;
    /** Requests ready to start, waiting for a free slot. */
    queuedRequests: number;
    /** Tiles waiting out a retry delay after a transient failure. */
    waitingRetries: number;
    /** Tile textures held in memory. */
    cachedTextures: number;
    /** Soft limit on the textures held. */
    cacheLimit: number;
    /** Estimated size of the held textures: their pixels at 4 bytes each. Excludes driver overhead and other resources. */
    textureBytes: number;
    /** Load attempts started over the layer's lifetime, retries included. The browser may answer some from its HTTP cache, so this is not a count of network transfers. */
    requests: number;
    /** Times a tile became wanted again while its texture was still held. */
    cacheReuses: number;
    /** Textures destroyed because the cache needed room. Teardown is not counted. */
    evictions: number;
    /** True when no request is loading, queued or waiting to retry. */
    idle: boolean;
}

const DEFAULT_CRS: TileCrs = DEFAULT_WORKSPACE_COORDINATE_FORMAT;
const MAX_REPORTED_ERRORS = 3;

/** What the last selection holds, kept for {@link TileLayerStats}. */
interface SelectionSummary {
    zoom: number | null;
    wantedZoom: number | null;
    selected: number;
    truncated: boolean;
    ready: number;
    fallback: number;
    missing: number;
}

const NO_SELECTION: SelectionSummary = { zoom: null, wantedZoom: null, selected: 0, truncated: false, ready: 0, fallback: 0, missing: 0 };

const EMPTY_FRAME: TileFrame<TileTexture> = {
    positions: new Float32Array(0),
    texCoords: new Float32Array(0),
    indices: new Uint32Array(0),
    draws: [],
};

/** Layer that draws tiles from a {@link TileSource}. */
export class TileLayer extends Layer {
    private readonly _source: ResolvedTileSource;
    private readonly _crs: TileCrs;
    private readonly _options: TileLayerOptions;
    private readonly _getOrigin: () => readonly number[] | undefined;

    private _pipeline: PipelineTiles | null = null;
    private _renderer: Renderer | null = null;
    private _store: TileStore<TileTexture> | null = null;
    private _frame: TileFrame<TileTexture> = EMPTY_FRAME;
    private _reportedErrors = 0;
    private _selection: SelectionSummary = NO_SELECTION;

    /**
     * Creates a tile layer. GPU resources are created later, by {@link createPipeline}.
     *
     * @param layerInfo - Layer identity and order.
     * @param layerRenderInfo - Initial render state; only `opacity` and `isSkip` apply.
     * @param options - Source and tuning.
     * @param getOrigin - Reads the map origin when drawing. Returns `undefined` until the map has one.
     * @throws If the source is invalid or the CRS is not supported.
     */
    constructor(
        layerInfo: LayerInfo,
        layerRenderInfo: LayerRenderInfo,
        options: TileLayerOptions,
        getOrigin: () => readonly number[] | undefined,
    ) {
        super(layerInfo, layerRenderInfo);
        this._source = resolveTileSource(options.source);
        this._crs = options.crs ?? DEFAULT_CRS;
        if (!isTileCrs(this._crs)) throw new Error(`Unsupported tile CRS: ${this._crs}.`);
        for (const name of ['maxCachedTiles', 'maxTiles'] as const) {
            const value = options[name];
            if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
                throw new Error(`Tile ${name} must be a positive integer.`);
            }
        }
        if (options.zoomBias !== undefined && !Number.isFinite(options.zoomBias)) throw new Error('Tile zoomBias must be finite.');
        if (options.maxDistanceInHeights !== undefined && (!Number.isFinite(options.maxDistanceInHeights) || options.maxDistanceInHeights <= 0)) {
            throw new Error('Tile maxDistanceInHeights must be positive and finite.');
        }
        if (layerRenderInfo.opacity !== undefined && (!Number.isFinite(layerRenderInfo.opacity) || layerRenderInfo.opacity < 0 || layerRenderInfo.opacity > 1)) {
            throw new Error('Tile opacity must be between 0 and 1.');
        }
        this._options = options;
        this._getOrigin = getOrigin;
    }

    /** The resolved tile source. */
    get source(): ResolvedTileSource {
        return this._source;
    }

    /** Credits the provider asks for, with links where the provider gives them. */
    get attribution(): readonly TileCredit[] {
        return this._source.attribution;
    }

    /** What the layer is doing now: the last selection, the requests and the cache. Cheap to read; does not trigger rendering. */
    get stats(): TileLayerStats {
        const store = this._store?.stats;
        const { zoom, wantedZoom, selected, truncated, ready, fallback, missing } = this._selection;
        const activeRequests = store?.inFlight ?? 0;
        const queuedRequests = store?.queued ?? 0;
        const waitingRetries = store?.waitingRetries ?? 0;
        return {
            visible: this._layerRenderInfo.isSkip !== true,
            zoom,
            wantedZoom,
            selectedTiles: selected,
            truncated,
            readyTiles: ready,
            fallbackTiles: fallback,
            missingTiles: missing,
            activeRequests,
            queuedRequests,
            waitingRetries,
            cachedTextures: store?.cachedTiles ?? 0,
            cacheLimit: store?.cacheLimit ?? 0,
            textureBytes: store?.readyBytes ?? 0,
            requests: store?.requests ?? 0,
            cacheReuses: store?.cacheReuses ?? 0,
            evictions: store?.evictions ?? 0,
            idle: activeRequests + queuedRequests + waitingRetries === 0,
        };
    }

    /** Tiles waiting or loading, for diagnostics and tests. */
    get pendingTiles(): number {
        return this._store ? this._store.pendingCount + this._store.inFlightCount : 0;
    }

    override get supportsColorMap(): boolean { return false; }

    createPipeline(renderer: Renderer): void {
        const pipeline = new PipelineTiles(renderer);
        this._renderer = renderer;
        this._pipeline = pipeline;
        pipeline.build(this);

        this._store = new TileStore<TileTexture>({
            source: this._source,
            maxCachedTiles: this._options.maxCachedTiles,
            load: async (url, signal) => {
                let bitmap = await fetchTileImage(url, signal);
                try {
                    // A tile cancelled while it downloaded must not cost a texture.
                    signal.throwIfAborted();
                    if (this._source.theme && this._source.theme !== 'original') {
                        const themed = applyTileTheme(bitmap, this._source.theme);
                        bitmap.close();
                        bitmap = themed;
                    }
                    return pipeline.createTileTexture(bitmap);
                } finally {
                    bitmap.close();
                }
            },
            dispose: (value) => value.texture.destroy(),
            sizeOf: (value) => value.width * value.height * TILE_TEXTURE_BYTES_PER_PIXEL,
            onChange: () => this.makeLayerDataDirty(),
            onError: (tile, error, permanent) => {
                if (this._reportedErrors >= MAX_REPORTED_ERRORS) return;
                this._reportedErrors++;
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(
                    `Tile layer '${this._layerInfo.id}': tile ${tile.z}/${tile.x}/${tile.y} ${permanent ? 'is unavailable' : 'failed to load'}: ${reason}`
                    + (this._reportedErrors === MAX_REPORTED_ERRORS ? ' (further tile errors are not reported)' : ''),
                );
            },
        });
    }

    /**
     * Updates render state. Hiding the layer cancels the work that was in
     * progress, because a hidden layer is skipped by the render loop and would
     * otherwise keep requesting and retrying tiles nobody sees. Ready textures are
     * kept, so showing the layer again draws at once and loads only what is missing.
     */
    override updateLayerRenderInfo(info: Partial<LayerRenderInfo>): void {
        const wasHidden = this._layerRenderInfo?.isSkip === true;
        super.updateLayerRenderInfo(info);
        if (this._layerRenderInfo.isSkip === true && !wasHidden) this.suspend();
    }

    /** Cancels queued, in-flight and waiting requests and retry timers, keeping what has loaded. */
    private suspend(): void {
        this._frame = EMPTY_FRAME;
        this._selection = NO_SELECTION;
        this._store?.update([]);
        this._store?.endFrame();
    }

    override prepareRender(camera: Camera): void {
        this._frame = EMPTY_FRAME;
        this._selection = NO_SELECTION;
        const store = this._store;
        const origin = this._getOrigin();
        if (!store || !origin || origin.length < 2) return;

        store.beginFrame();

        const renderer = this._renderer;
        const viewport = renderer && renderer.pixelWidth > 0 && renderer.pixelHeight > 0
            ? [renderer.pixelWidth, renderer.pixelHeight] as const : undefined;
        const view = { camera, origin: [origin[0]!, origin[1]!] as const, crs: this._crs, viewport };
        const selection = selectTiles(view, this._source, this._options);
        if (!selection) {
            store.update([]);
            store.endFrame();
            return;
        }

        store.update(selection.tiles);

        const items: Array<FrameTile<TileTexture>> = [];
        let ready = 0;
        let fallbackCount = 0;
        for (const tile of selection.tiles) {
            const entry = store.get(tile);
            if (entry?.state === 'ready' && entry.value) {
                items.push({ tile, ref: entry.value });
                ready++;
                continue;
            }
            const fallback = store.fallbackFor(tile);
            if (fallback?.entry.value) {
                items.push({ tile, ref: fallback.entry.value, levels: fallback.levels });
                fallbackCount++;
            }
        }
        this._selection = {
            zoom: selection.z,
            wantedZoom: selection.wantedZoom,
            selected: selection.tiles.length,
            truncated: selection.truncated,
            ready,
            fallback: fallbackCount,
            missing: selection.tiles.length - ready - fallbackCount,
        };
        this._frame = buildTileFrame(items, this._crs, view.origin);
        store.endFrame();
    }

    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        const pipeline = this._pipeline;
        if (!pipeline) return;

        this._dataIsDirty = false;
        if (this._renderInfoIsDirty) {
            pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }
        pipeline.renderFrame(camera, passEncoder, this._frame);
    }

    override destroy(): void {
        this._store?.destroy();
        this._store = null;
        this._frame = EMPTY_FRAME;
        this._pipeline?.destroy();
        this._pipeline = null;
        this._renderer = null;
    }
}
