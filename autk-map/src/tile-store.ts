/**
 * @module AutkMapTileStore
 * Keeps the tiles a map needs: decides what to request, holds what has loaded,
 * and finds a stand-in for a tile that has not.
 *
 * The store joins a {@link TileCache} and a {@link TileLoader} with the policy
 * a tile layer needs and no graphics code. Each frame the layer gives it the
 * tiles in view, most important first. The store requests the missing ones,
 * together with their parents, which load first because one coarse tile covers
 * four finer ones and puts something on screen sooner. It cancels what the
 * view has left behind and retries failed tiles only when that can help. While
 * a tile is loading the layer asks for the nearest loaded ancestor to draw in
 * its place.
 */

import type { TileEntry } from './tile-cache';
import { TileCache } from './tile-cache';
import type { TileIndex } from './tile-index';
import { ancestorTile, isValidTile, tileKey } from './tile-index';
import { TileLoader } from './tile-loader';
import type { ResolvedTileSource } from './tile-source';
import { expandTileUrl, tileSourceId } from './tile-source';

/** Options for a {@link TileStore}. */
export interface TileStoreOptions<T> {
    /** Source the tiles come from. */
    source: ResolvedTileSource;
    /** Loads one tile. Receives the URL and an abort signal. */
    load: (url: string, signal: AbortSignal) => Promise<T>;
    /** Releases a value that leaves the store, such as by destroying a texture. */
    dispose?: (value: T) => void;
    /** Called when a tile becomes ready, so the map can draw a new frame. */
    onChange?: () => void;
    /** Size in bytes of a loaded value, for the memory estimate in {@link TileStore.stats}. Defaults to 0. */
    sizeOf?: (value: T) => number;
    /** Called when a tile fails for good, so the layer can report it. */
    onError?: (tile: TileIndex, error: unknown, permanent: boolean) => void;
    /** Tiles kept in memory. Defaults to 256. */
    maxCachedTiles?: number;
    /** Requests in flight at once. Defaults to 8. */
    maxConcurrent?: number;
    /** Zoom levels above a tile that are loaded along with it. Defaults to 1. */
    preloadAncestors?: number;
    /** Wait in ms before a transiently failed tile is requested again. Defaults to 5000. */
    retryCooldownMs?: number;
    /** Retries inside the loader for transient failures. Defaults to 2. */
    maxRetries?: number;
    /** Clock in ms, replaceable in tests. Defaults to `Date.now`. */
    now?: () => number;
}

/** Counters and queue state of a {@link TileStore}. */
export interface TileStoreStats {
    /** Load attempts started over the store's lifetime, retries included. Says nothing about network transfers: the browser may answer from its HTTP cache. */
    requests: number;
    /** Times a tile became wanted again while its value was still held, so no request was needed. */
    cacheReuses: number;
    /** Values dropped because the cache needed room. Teardown is not counted. */
    evictions: number;
    /** Tiles holding a loaded value. */
    cachedTiles: number;
    /** Soft limit on the number of tiles held. */
    cacheLimit: number;
    /** Sum of `sizeOf` over the held values. */
    readyBytes: number;
    /** Requests loading right now. */
    inFlight: number;
    /** Requests ready to start, waiting for a free slot. */
    queued: number;
    /** Tiles waiting out a retry delay, in the loader or in the store's cooldown. */
    waitingRetries: number;
}

/** A loaded ancestor standing in for a tile. */
export interface TileFallback<T> {
    /** The loaded ancestor. */
    entry: TileEntry<T>;
    /** How many zoom levels above the requested tile it is. */
    levels: number;
}

const DEFAULT_MAX_CACHED = 256;
const DEFAULT_PRELOAD_ANCESTORS = 1;
const DEFAULT_RETRY_COOLDOWN_MS = 5000;
const MAX_RETRY_BACKOFF_MS = 60_000;

/**
 * Cache, request policy and fallback lookup for one tile source.
 *
 * @typeParam T - Value kept for a loaded tile.
 */
export class TileStore<T> {
    private readonly source: ResolvedTileSource;
    private readonly sourceId: string;
    private readonly cache: TileCache<T>;
    private readonly loader: TileLoader<T>;
    private readonly preloadAncestors: number;
    private readonly retryCooldownMs: number;
    private readonly now: () => number;
    private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly failures = new Map<string, number>();
    private wanted: ReadonlySet<string> = new Set();
    private readonly sizeOf: (value: T) => number;
    private requests = 0;
    private cacheReuses = 0;
    private evictions = 0;
    private readyBytes = 0;
    private destroyed = false;

    /**
     * Creates a store.
     *
     * @param options - Source, load function and limits.
     */
    constructor(options: TileStoreOptions<T>) {
        this.source = options.source;
        this.sourceId = tileSourceId(options.source);
        this.now = options.now ?? Date.now;
        this.preloadAncestors = Math.max(0, Math.floor(options.preloadAncestors ?? DEFAULT_PRELOAD_ANCESTORS));
        this.retryCooldownMs = Math.max(0, options.retryCooldownMs ?? DEFAULT_RETRY_COOLDOWN_MS);

        this.sizeOf = options.sizeOf ?? (() => 0);

        this.cache = new TileCache<T>(options.maxCachedTiles ?? DEFAULT_MAX_CACHED, (entry, reason) => {
            if (entry.value !== undefined) {
                this.readyBytes -= this.sizeOf(entry.value);
                options.dispose?.(entry.value);
            }
            if (reason === 'pressure') this.evictions++;
        });

        this.loader = new TileLoader<T>({
            load: (url, signal) => {
                this.requests++;
                return options.load(url, signal);
            },
            maxConcurrent: options.maxConcurrent,
            maxRetries: options.maxRetries,
            dispose: options.dispose,
            onLoaded: (key, value) => {
                this.failures.delete(key);
                if (this.destroyed || !this.cache.resolve(key, value)) {
                    options.dispose?.(value);
                    return;
                }
                this.readyBytes += this.sizeOf(value);
                options.onChange?.();
            },
            onFailed: (key, error, permanent) => {
                const delay = permanent ? Infinity : this.nextBackoff(key);
                const entry = this.cache.fail(key, error, permanent ? Infinity : this.now() + delay);
                if (!entry) return;
                if (!permanent) this.scheduleRetry(key, delay);
                options.onError?.(entry.tile, error, permanent);
            },
            onCancelled: (key) => {
                this.failures.delete(key);
                if (this.cache.peek(key)?.state === 'loading') this.cache.delete(key);
            },
        });
    }

    /** Tiles held, in any state. */
    get cachedCount(): number {
        return this.cache.size;
    }

    /** Counters and queue state, for diagnostics and the example's statistics panel. Reading it changes nothing. */
    get stats(): TileStoreStats {
        return {
            requests: this.requests,
            cacheReuses: this.cacheReuses,
            evictions: this.evictions,
            cachedTiles: this.cache.readyCount,
            cacheLimit: this.cache.limit,
            readyBytes: this.readyBytes,
            inFlight: this.loader.inFlightCount,
            queued: this.loader.queuedCount,
            waitingRetries: this.loader.waitingCount + this.retryTimers.size,
        };
    }

    /** Tiles waiting to start loading. */
    get pendingCount(): number {
        return this.loader.pendingCount;
    }

    /** Tiles loading right now. */
    get inFlightCount(): number {
        return this.loader.inFlightCount;
    }

    /**
     * Starts a frame. Tiles read from here on are protected from eviction until
     * the next frame. Nothing is evicted yet: call {@link TileStore.update} and
     * read the tiles to draw, then {@link TileStore.endFrame}.
     */
    beginFrame(): void {
        this.cache.beginFrame();
    }

    /**
     * Ends a frame by evicting tiles beyond the cache limit that this frame did
     * not use. Tiles it did use stay, even when they exceed the limit, so a view
     * larger than the cache does not dispose and reload its own tiles.
     */
    endFrame(): void {
        this.cache.trim();
    }

    /**
     * Reads a tile, marking it used in this frame.
     *
     * @param tile - Tile address.
     * @returns The entry in any state, or `undefined` if the store has never been asked for it.
     */
    get(tile: TileIndex): TileEntry<T> | undefined {
        return this.cache.get(this.keyOf(tile));
    }

    /**
     * Finds the nearest loaded ancestor of a tile, to draw while it loads.
     * The ancestor is marked used in this frame.
     *
     * @param tile - Tile address.
     * @returns The ancestor and how far up it is, or `null` if none has loaded.
     */
    fallbackFor(tile: TileIndex): TileFallback<T> | null {
        for (let levels = 1; levels <= tile.z; levels++) {
            const ancestor = ancestorTile(tile, levels);
            if (!ancestor) return null;
            const entry = this.cache.get(this.keyOf(ancestor));
            if (entry?.state === 'ready') return { entry, levels };
        }
        return null;
    }

    /**
     * Declares the tiles the view needs and requests what is missing.
     *
     * What the frame uses is protected before anything new is admitted: the
     * wanted tiles, their preloaded ancestors and the loaded ancestors that
     * stand in for tiles still loading. Requests already queued are sent again
     * in the current order, so a tile that became more important moves ahead.
     * Tiles not mentioned, neither as wanted nor as a preloaded ancestor, are
     * cancelled if still waiting or loading.
     *
     * @param tiles - Tiles in view, most important first.
     */
    update(tiles: readonly TileIndex[]): void {
        if (this.destroyed) return;

        const wanted = new Map<string, TileIndex>();
        const ancestors = new Map<string, TileIndex>();
        for (const tile of tiles) {
            if (this.inRange(tile)) wanted.set(this.keyOf(tile), tile);
        }
        for (const tile of wanted.values()) {
            for (let levels = 1; levels <= this.preloadAncestors; levels++) {
                const ancestor = ancestorTile(tile, levels);
                if (ancestor && this.inRange(ancestor)) ancestors.set(this.keyOf(ancestor), ancestor);
            }
        }

        // Coarse ancestors first, then the tiles in the order given.
        const ordered = [
            ...[...ancestors.entries()].sort((a, b) => a[1].z - b[1].z),
            ...wanted.entries(),
        ];

        // Phase 1: protect what this frame uses, before any new entry can evict it.
        // A held value that was not wanted at the last update is a reuse: no request needed.
        for (const [key] of ordered) {
            const held = this.cache.get(key);
            if (held?.state === 'ready' && !this.wanted.has(key)) this.cacheReuses++;
        }
        for (const tile of wanted.values()) {
            if (this.cache.peek(this.keyOf(tile))?.state !== 'ready') this.fallbackFor(tile);
        }

        // Phase 2: request what is missing, and refresh the order of what is queued.
        const requests: Array<{ key: string; url: string }> = [];
        const keep = new Set<string>();
        for (const [key, tile] of ordered) {
            keep.add(key);
            const entry = this.cache.peek(key);
            if (entry?.state === 'ready') continue;
            if (entry?.state === 'missing') {
                if (this.now() < entry.retryAfter) continue;
                this.cancelRetry(key);
                this.cache.startLoading(key, tile);
            } else if (!entry) {
                this.cache.startLoading(key, tile);
            }
            requests.push({ key, url: expandTileUrl(this.source, tile) });
        }

        this.wanted = keep;
        for (const key of [...this.retryTimers.keys()]) {
            if (!keep.has(key)) this.cancelRetry(key);
        }
        this.loader.retainOnly(keep);
        this.loader.requestAll(requests);
    }

    /** Cancels all loading and releases every held value. The store cannot be used afterwards. */
    destroy(): void {
        this.destroyed = true;
        for (const key of [...this.retryTimers.keys()]) this.cancelRetry(key);
        this.failures.clear();
        this.loader.clear();
        this.cache.clear();
    }

    /** Wait before the next retry of a tile: the cooldown, doubled for each failure in a row, up to a limit. */
    private nextBackoff(key: string): number {
        const count = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, count);
        return Math.min(this.retryCooldownMs * 2 ** (count - 1), Math.max(MAX_RETRY_BACKOFF_MS, this.retryCooldownMs));
    }

    /** Requests a failed tile again at its deadline if the view still wants it. */
    private scheduleRetry(key: string, delay: number): void {
        this.cancelRetry(key);
        this.retryTimers.set(key, setTimeout(() => {
            this.retryTimers.delete(key);
            this.retry(key);
        }, delay));
    }

    private retry(key: string): void {
        if (this.destroyed || !this.wanted.has(key)) return;
        const entry = this.cache.peek(key);
        if (entry?.state !== 'missing') return;
        const remaining = entry.retryAfter - this.now();
        if (remaining > 0) {
            this.scheduleRetry(key, remaining);
            return;
        }
        this.cache.startLoading(key, entry.tile);
        this.loader.request(key, expandTileUrl(this.source, entry.tile));
    }

    private cancelRetry(key: string): void {
        const timer = this.retryTimers.get(key);
        if (timer !== undefined) clearTimeout(timer);
        this.retryTimers.delete(key);
    }

    private keyOf(tile: TileIndex): string {
        return tileKey(this.sourceId, tile);
    }

    private inRange(tile: TileIndex): boolean {
        return isValidTile(tile) && tile.z >= this.source.minZoom && tile.z <= this.source.maxZoom;
    }
}
