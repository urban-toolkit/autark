/**
 * @module AutkMapTileCache
 * In-memory cache of loaded tiles with least-recently-used eviction.
 *
 * Each entry is a tile in one of three states: `loading`, `ready` (holding a
 * value such as a GPU texture) or `missing` (the load failed). Entries drawn in
 * the current frame are never evicted, so a frame cannot lose a tile it is
 * about to draw, and entries still loading are never evicted, so a request in
 * flight always has an entry to land in. When everything is protected the cache
 * is allowed to exceed its limit, and it comes back down when the view needs
 * fewer tiles. Starting a frame never evicts: the caller first marks what the
 * frame needs by reading it, then calls {@link TileCache.trim}.
 */

import type { TileIndex } from './tile-index';

/** Load state of a cached tile. */
export type TileState = 'loading' | 'ready' | 'missing';

/** One cached tile. */
export interface TileEntry<T> {
    readonly key: string;
    readonly tile: TileIndex;
    state: TileState;
    /** Loaded value, present when `state` is `ready`. */
    value?: T;
    /** Why the load failed, present when `state` is `missing`. */
    error?: unknown;
    /** Time (ms) after which a `missing` tile may be requested again; `Infinity` means never. */
    retryAfter: number;
    /** Frame in which the entry was last read through {@link TileCache.get}. */
    lastUsedFrame: number;
}

/**
 * Why an entry left the cache: `pressure` when the cache needed room, `removed`
 * when the caller deleted or cleared it (for example at teardown).
 */
export type TileEvictionReason = 'pressure' | 'removed';

/** Callback run for an entry that leaves the cache while holding a value. */
export type TileEvictionHandler<T> = (entry: TileEntry<T>, reason: TileEvictionReason) => void;

/**
 * LRU cache of tiles keyed by string.
 *
 * @typeParam T - Value stored for a loaded tile.
 * @example
 * const cache = new TileCache<GPUTexture>(256, (entry) => entry.value?.destroy());
 */
export class TileCache<T> {
    private readonly entries = new Map<string, TileEntry<T>>();
    private frame = 0;
    private maxEntries: number;
    private readonly onEvict: TileEvictionHandler<T> | undefined;

    /**
     * Creates a cache.
     *
     * @param maxEntries - Soft limit on the number of entries; at least 1.
     * @param onEvict - Called for each entry removed while it holds a value.
     */
    constructor(maxEntries: number, onEvict?: TileEvictionHandler<T>) {
        this.maxEntries = Math.max(1, Math.floor(maxEntries));
        this.onEvict = onEvict;
    }

    /** Number of entries, in any state. */
    get size(): number {
        return this.entries.size;
    }

    /** Current limit on the number of entries. */
    get limit(): number {
        return this.maxEntries;
    }

    /** Entries holding a loaded value. */
    get readyCount(): number {
        let ready = 0;
        for (const entry of this.entries.values()) if (entry.state === 'ready') ready++;
        return ready;
    }

    /**
     * Changes the limit and evicts down to it where possible.
     *
     * @param maxEntries - New soft limit; at least 1.
     */
    setLimit(maxEntries: number): void {
        this.maxEntries = Math.max(1, Math.floor(maxEntries));
        this.evictOverflow();
    }

    /**
     * Starts a new frame. Entries read after this call are protected from
     * eviction until the next call. Nothing is evicted here, so the entries the
     * new frame needs can be read, and thereby protected, before any are lost.
     */
    beginFrame(): void {
        this.frame++;
    }

    /**
     * Evicts the least recently used entries beyond the limit, skipping
     * entries still loading and entries read in the current frame.
     */
    trim(): void {
        this.evictOverflow();
    }

    /**
     * Reads an entry, marking it used in this frame and most recently used.
     *
     * @param key - Cache key.
     * @returns The entry, or `undefined`.
     */
    get(key: string): TileEntry<T> | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        entry.lastUsedFrame = this.frame;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    /**
     * Reads an entry without changing its use or order.
     *
     * @param key - Cache key.
     * @returns The entry, or `undefined`.
     */
    peek(key: string): TileEntry<T> | undefined {
        return this.entries.get(key);
    }

    /**
     * Creates a `loading` entry, or puts an existing `missing` one back to
     * `loading`.
     *
     * @param key - Cache key.
     * @param tile - Tile address.
     * @returns The entry.
     */
    startLoading(key: string, tile: TileIndex): TileEntry<T> {
        const existing = this.entries.get(key);
        if (existing) {
            if (existing.state === 'missing') {
                existing.state = 'loading';
                existing.error = undefined;
                existing.retryAfter = 0;
            }
            return existing;
        }
        const entry: TileEntry<T> = { key, tile, state: 'loading', retryAfter: 0, lastUsedFrame: this.frame };
        this.entries.set(key, entry);
        this.evictOverflow();
        return entry;
    }

    /**
     * Stores the value of a tile that finished loading.
     *
     * @param key - Cache key.
     * @param value - Loaded value.
     * @returns The entry, or `undefined` when no entry is waiting for this tile
     *   (it was cancelled): the caller still owns `value` and must release it.
     */
    resolve(key: string, value: T): TileEntry<T> | undefined {
        const entry = this.entries.get(key);
        if (!entry || entry.state !== 'loading') return undefined;
        entry.state = 'ready';
        entry.value = value;
        entry.error = undefined;
        this.evictOverflow();
        return entry;
    }

    /**
     * Marks a loading tile as failed.
     *
     * @param key - Cache key.
     * @param error - What went wrong.
     * @param retryAfter - Time (ms) after which it may be requested again; `Infinity` for never.
     * @returns The entry, or `undefined` when no entry was loading.
     */
    fail(key: string, error: unknown, retryAfter: number): TileEntry<T> | undefined {
        const entry = this.entries.get(key);
        if (!entry || entry.state !== 'loading') return undefined;
        entry.state = 'missing';
        entry.error = error;
        entry.retryAfter = retryAfter;
        return entry;
    }

    /**
     * Removes an entry. The eviction handler runs if it holds a value.
     *
     * @param key - Cache key.
     * @returns `true` if an entry was removed.
     */
    delete(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        this.entries.delete(key);
        this.release(entry, 'removed');
        return true;
    }

    /** Removes every entry, running the eviction handler for those holding a value. */
    clear(): void {
        const all = [...this.entries.values()];
        this.entries.clear();
        for (const entry of all) this.release(entry, 'removed');
    }

    private release(entry: TileEntry<T>, reason: TileEvictionReason): void {
        if (entry.state === 'ready') {
            this.onEvict?.(entry, reason);
            entry.value = undefined;
        }
    }

    /** Evicts the least recently used entries that are neither loading nor used in this frame. */
    private evictOverflow(): void {
        if (this.entries.size <= this.maxEntries) return;
        for (const [key, entry] of this.entries) {
            if (this.entries.size <= this.maxEntries) break;
            if (entry.state === 'loading' || entry.lastUsedFrame === this.frame) continue;
            this.entries.delete(key);
            this.release(entry, 'pressure');
        }
    }
}
