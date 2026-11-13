/**
 * @module height-source-tiles
 * A height source streamed from elevation tiles: a clipmap of nested windows.
 *
 * Level 0 is the finest window, around the view centre, and each further level
 * covers twice the extent at half the detail. Level `k` reads tiles of zoom
 * `finest - k`, so a window needs at most 3 x 3 tiles of its own zoom and the
 * whole stack at most `3 * 3 * levels`. The outermost window is the terrain.
 *
 * Tiles are fetched through a {@link TileStore}, coarsest level first, so a
 * complete low-detail surface is there after one round trip. Windows are
 * composed on the CPU (see `height-window.ts`) and recomposed only when their
 * position snaps to a new sample or a tile they read arrives.
 */

import { resolveElevationValidation } from '@urban-toolkit/autk-core';
import type { ElevationValidationOptions, ElevationValidationStats, ResolvedElevationValidation } from '@urban-toolkit/autk-core';
import { fetchDemTile } from './dem-load';
import type { DemTile } from './dem-decode';
import { MAX_WINDOW_SIZE, composeWindow, composeWindowSteps, crsScaleAt, maxTilesPerWindow, planWindow } from './height-window';
import type { ComposedWindow, CrsScale, WindowPlan } from './height-window';
import { MAX_HEIGHT_LEVELS, heightAt } from './height-source';
import type { HeightLevel, StreamingHeightSource } from './height-source';
import { ancestorTile } from './tile-index';
import type { TileIndex } from './tile-index';
import { TimingWindow } from './terrain-timing';
import type { TimingSummary } from './terrain-timing';
import { DEFAULT_MAX_CONCURRENT } from './tile-loader';
import { TileStore } from './tile-store';
import type { TileStoreStats } from './tile-store';
import type { ResolvedTerrainTileSource } from './terrain-tile-source';
import type { TileCrs } from './tile-projection';

/** Levels when none is given. */
export const DEFAULT_TERRAIN_LEVELS = 6;
/** Samples along each window edge when none is given. */
export const DEFAULT_TERRAIN_WINDOW_SIZE = 512;
/** Zoom of the finest level when the source allows it and no bias is given. */
export const DEFAULT_FINEST_TERRAIN_ZOOM = 14;
/** Milliseconds of window composition a frame may spend before it leaves the rest for the next frame. */
export const DEFAULT_COMPOSE_BUDGET_MS = 4;
/** Tiles kept in memory when none is given. */
export const DEFAULT_TERRAIN_CACHED_TILES = 128;

/** Options for a {@link TileHeightSource}. */
export interface TileHeightSourceOptions {
    validation?: false | ElevationValidationOptions;
    /** Elevation source. */
    source: ResolvedTerrainTileSource;
    /** Coordinate system of the map plane. */
    crs: TileCrs;
    /** Map origin in `crs` units. */
    origin: readonly [number, number];
    /** Local-space point the windows start centred on. */
    centre: readonly [number, number];
    /** Levels wanted, 1 to {@link MAX_HEIGHT_LEVELS}. Fewer are used when the source has too few zooms. Defaults to 6. */
    levels?: number;
    /** Samples along each window edge, even. Defaults to 512. */
    windowSize?: number;
    /** Added to the finest zoom (14, or the source's `maxZoom` when lower). Negative gives coarser, cheaper terrain. Defaults to 0. */
    zoomBias?: number;
    /** Tiles kept in memory. Defaults to 128, and is raised to what the windows can need at once. */
    maxCachedTiles?: number;
    /** Multiplies every height. Defaults to 1. */
    verticalScale?: number;
    /**
     * Milliseconds of composition per frame, checked between four-row batches.
     * At least one batch progresses each update; old windows remain visible until
     * replacements finish. Initial empty levels are cheap placeholders, not an
     * exemption from the sampling budget. `Infinity` finishes all work synchronously.
     */
    composeBudgetMs?: number;
    /** Called when a tile arrives, so the map can draw a new frame. */
    onChange?: () => void;
    /** Called when a tile fails for good. */
    onError?: (tile: TileIndex, error: unknown, permanent: boolean) => void;
    /** Loads one tile. Replaceable in tests; defaults to `fetchDemTile`. */
    load?: (url: string, signal: AbortSignal) => Promise<DemTile>;
}

/**
 * Upper bounds, in bytes, of what a {@link TileHeightSource} holds, by kind. They follow from the
 * configuration alone, so they hold however tiles arrive. They do not include the imagery overlay,
 * which the map owns and which is much larger (see TILE-TERRAIN.md, Memory).
 */
export interface TerrainMemory {
    /** Decoded tiles in the cache plus at most `tileBound` retained by in-progress snapshots. */
    decodedTiles: number;
    /** Published CPU windows plus one scratch grid per level. */
    cpuWindows: number;
    /** The GPU height texture array, the size of the published CPU windows. */
    gpuHeights: number;
    /** Tiles being fetched and decoded at once, estimated as an RGBA bitmap plus the decoded floats each. */
    decoding: number;
    /** Live validation masks and correction arrays in pending row-batch jobs. */
    validationScratch: number;
    /** Sum of the above. */
    total: number;
}

/**
 * CPU timings of the terrain work over the most recent frames, in milliseconds.
 *
 * `update` covers every frame (planning, tile bookkeeping and composition), so most frames are near
 * zero once the view is still. `compose` and `upload` cover only the frames that processed composition batches
 * or uploaded a window, the cost of a frame that does the work. Upload is the time to submit, not for the GPU to finish.
 */
export interface TerrainTiming {
    /** Whole `update` call, every frame. */
    update: TimingSummary;
    /** Composition alone, frames that processed at least one row batch. */
    compose: TimingSummary;
    /** Submitting the changed levels to the GPU, frames that uploaded. */
    upload: TimingSummary;
    /** Completed windows per frame with composition work; partial batches may complete none. */
    windowsPerCompose: TimingSummary;
}

/** Read-only statistics of a {@link TileHeightSource}. */
export interface TerrainTileStats {
    /** Published per-window validation totals; overlapping windows can count the same input texel. */
    validation: ElevationValidationStats | null;
    /** Number of levels in use. */
    levels: number;
    /** Tile zoom read by each level, finest first. */
    zooms: readonly number[];
    /** Samples along each window edge. */
    windowSize: number;
    /** Tiles the windows need right now. */
    wantedTiles: number;
    /** Conservative bound for window tiles and validation parent references. */
    tileBound: number;
    /** Tiles the cache may hold; at least `tileBound`, so tiles in use are never evicted. */
    cacheLimit: number;
    /** Upper bounds, in bytes, of the memory the height source holds; see {@link TerrainMemory}. */
    memory: TerrainMemory;
    /** Of those, tiles that have loaded. */
    readyTiles: number;
    /** Samples per level that no loaded tile covers yet, finest first. */
    missingSamples: readonly number[];
    /** Windows that are out of date and wait for a frame with composition budget. */
    pendingLevels: number;
    /** Every requested window has height coverage, including coarser fallback. */
    complete: boolean;
    /** Requested tiles whose most recent request failed. */
    failedTiles: number;
    /** `true` when no composition, request, or retry is pending, even if coverage is incomplete. */
    idle: boolean;
    /** Request queue and cache counters of the tile store. */
    store: TileStoreStats;
    /** Recent CPU timings; see {@link TerrainTiming}. */
    timing: TerrainTiming;
}

/**
 * Streamed terrain heights.
 *
 * @example
 * const heights = new TileHeightSource({ source, crs: 'EPSG:3395', origin, centre: [0, 0], onChange: () => map.requestRender() });
 * heights.update(groundPoint);
 */
export class TileHeightSource implements StreamingHeightSource {
    readonly levels: readonly HeightLevel[];
    bounds: readonly [number, number, number, number] = [0, 0, 0, 0];
    minHeight = 0;
    maxHeight = 0;
    version = 0;
    readonly levelVersions: number[];

    private readonly store: TileStore<DemTile>;
    private readonly tileBound: number;
    private readonly cacheLimit: number;
    private readonly zooms: number[];
    private readonly windowSize: number;
    private readonly scale: CrsScale;
    private readonly verticalScale: number;
    private readonly minZoom: number;
    private readonly validation?: ResolvedElevationValidation;
    private readonly levelData: HeightLevel[];
    private plans: Array<WindowPlan | undefined>;
    private composed: Array<ComposedWindow | undefined>;
    private signatures: string[];
    /** Scratch grids are published atomically; a changed camera plan cancels obsolete work. */
    private readonly jobs: Array<{
        plan: WindowPlan;
        ownFlags: string;
        allReady: boolean;
        coarserSignature: string;
        steps: Generator<void, ComposedWindow>;
        validationBytes: number;
    } | undefined> = [];
    private counter = 0;
    private wantedTiles = 0;
    private readyTiles = 0;
    private failedTiles = 0;
    private readonly composeBudgetMs: number;
    /** Per level, consecutive updates in which it was out of date and not composed. */
    private readonly waiting: number[];
    private pendingLevels = 0;
    private readonly updateTimes = new TimingWindow();
    private readonly composeTimes = new TimingWindow();
    private readonly uploadTimes = new TimingWindow();
    private readonly composeCounts = new TimingWindow();

    /**
     * @param options - Source, placement and limits.
     * @throws {Error} If the window size is not even, or the source has no zoom to read.
     */
    constructor(private readonly options: TileHeightSourceOptions) {
        const { source } = options;
        this.validation = resolveElevationValidation(options.validation);
        const windowSize = options.windowSize ?? DEFAULT_TERRAIN_WINDOW_SIZE;
        if (!Number.isSafeInteger(windowSize) || windowSize < 4 || windowSize > MAX_WINDOW_SIZE || windowSize % 2 !== 0) {
            throw new Error(`Terrain window size must be an even integer from 4 to ${MAX_WINDOW_SIZE}, got ${windowSize}.`);
        }
        if (options.crs !== 'EPSG:3395' && options.crs !== 'EPSG:3857') {
            // Heights are metres and `verticalScale` assumes a horizontal plane in metres; degrees would make a distorted scene.
            throw new Error(`Terrain tiles need a metre-based coordinate system ('EPSG:3395' or 'EPSG:3857'); received '${options.crs}'.`);
        }
        if (options.levels !== undefined && (!Number.isSafeInteger(options.levels) || options.levels < 1 || options.levels > MAX_HEIGHT_LEVELS)) {
            throw new Error(`Terrain levels must be an integer from 1 to ${MAX_HEIGHT_LEVELS}.`);
        }
        if (options.maxCachedTiles !== undefined && (!Number.isSafeInteger(options.maxCachedTiles) || options.maxCachedTiles < 1)) {
            throw new Error('Terrain maxCachedTiles must be a positive safe integer.');
        }
        if (options.zoomBias !== undefined && !Number.isFinite(options.zoomBias)) throw new Error('Terrain zoomBias must be finite.');
        if (options.verticalScale !== undefined && (!Number.isFinite(options.verticalScale) || options.verticalScale <= 0)) {
            throw new Error('Terrain verticalScale must be positive and finite.');
        }
        if (options.composeBudgetMs !== undefined && (typeof options.composeBudgetMs !== 'number' || Number.isNaN(options.composeBudgetMs) || options.composeBudgetMs < 0)) {
            throw new Error('Terrain composeBudgetMs must be nonnegative or Infinity.');
        }
        if (![...options.origin, ...options.centre].every(Number.isFinite)) throw new Error('Terrain origin and centre must be finite.');
        this.windowSize = windowSize;
        this.verticalScale = Number.isFinite(options.verticalScale) ? (options.verticalScale as number) : 1;
        this.minZoom = source.minZoom;

        const bias = Number.isFinite(options.zoomBias) ? Math.round(options.zoomBias as number) : 0;
        const finest = Math.min(source.maxZoom, Math.max(source.minZoom, Math.min(source.maxZoom, DEFAULT_FINEST_TERRAIN_ZOOM) + bias));
        const wanted = Math.min(MAX_HEIGHT_LEVELS, Math.max(1, Math.floor(options.levels ?? DEFAULT_TERRAIN_LEVELS)));
        this.zooms = [];
        for (let k = 0; k < wanted && finest - k >= source.minZoom; k++) this.zooms.push(finest - k);
        if (this.zooms.length === 0) throw new Error('The terrain tile source has no zoom level to read.');

        this.scale = crsScaleAt(options.crs, options.origin);
        const count = this.zooms.length;
        this.plans = new Array(count).fill(undefined);
        this.composed = new Array(count).fill(undefined);
        this.signatures = new Array(count).fill('');
        this.levelVersions = new Array(count).fill(0);
        this.waiting = new Array(count).fill(0);
        const budget = options.composeBudgetMs;
        this.composeBudgetMs = typeof budget === 'number' && !Number.isNaN(budget) && budget >= 0 ? budget : DEFAULT_COMPOSE_BUDGET_MS;
        this.levelData = new Array(count);
        this.levels = this.levelData;

        // Tiles the windows can need at once are protected from eviction, so the cache must hold them all:
        // this is what makes the memory bound hold. Decoded tiles then take at most `cacheLimit * tileSize² * 4` bytes.
        this.tileBound = count * maxTilesPerWindow(windowSize, source.tileSize, this.validation ? 6 : 1) * (this.validation ? 2 : 1);
        if (!Number.isSafeInteger(this.tileBound) || this.tileBound > 4096) {
            throw new Error('Terrain windows would request too many tiles; reduce levels/windowSize or increase the source tile size.');
        }
        this.cacheLimit = Math.max(options.maxCachedTiles ?? DEFAULT_TERRAIN_CACHED_TILES, this.tileBound);
        this.store = new TileStore<DemTile>({
            source,
            load: options.load ?? ((url, signal) => fetchDemTile(url, signal, source.encoding, source.tileSize)),
            sizeOf: (tile) => tile.heights.byteLength,
            onChange: () => options.onChange?.(),
            onError: options.onError,
            maxCachedTiles: this.cacheLimit,
            // Validation also needs a reference below the outermost render level.
            preloadAncestors: this.validation ? 1 : 0,
        });

        try { this.update(options.centre); } catch (error) { this.store.destroy(); throw error; }
    }

    /** Upper bounds of the memory this source holds, from its configuration. */
    private memoryBound(): TerrainMemory {
        const tilePixels = this.options.source.tileSize ** 2;
        const windowBytes = this.zooms.length * this.windowSize ** 2 * Float32Array.BYTES_PER_ELEMENT;
        const decodedTiles = (this.cacheLimit + this.tileBound) * tilePixels * Float32Array.BYTES_PER_ELEMENT;
        const decoding = DEFAULT_MAX_CONCURRENT * tilePixels * 2 * Float32Array.BYTES_PER_ELEMENT;
        const validationScratch = this.jobs.reduce((sum, job) => sum + (job?.validationBytes ?? 0), 0);
        return { decodedTiles, cpuWindows: 2 * windowBytes, gpuHeights: windowBytes, decoding, validationScratch, total: decodedTiles + 3 * windowBytes + decoding + validationScratch };
    }

    /** Statistics for diagnostics. Reading them changes nothing. */
    get stats(): TerrainTileStats {
        const store = this.store.stats;
        const missing = this.composed.map((w) => w?.missing ?? 0);
        const validation = this.validation ? { checked: 0, rejected: 0, corrected: 0, unresolved: 0 } : null;
        if (validation) for (const window of this.composed) {
            if (window?.validation) for (const key of ['checked', 'rejected', 'corrected', 'unresolved'] as const) validation[key] += window.validation[key];
        }
        return {
            validation,
            levels: this.zooms.length,
            zooms: [...this.zooms],
            windowSize: this.windowSize,
            wantedTiles: this.wantedTiles,
            tileBound: this.tileBound,
            cacheLimit: this.cacheLimit,
            memory: this.memoryBound(),
            readyTiles: this.readyTiles,
            missingSamples: missing,
            pendingLevels: this.pendingLevels,
            complete: missing.every((m) => m === 0),
            failedTiles: this.failedTiles,
            idle: this.pendingLevels === 0 && store.inFlight === 0 && store.queued === 0 && store.waitingRetries === 0,
            store,
            timing: {
                update: this.updateTimes.summary(),
                compose: this.composeTimes.summary(),
                upload: this.uploadTimes.summary(),
                windowsPerCompose: this.composeCounts.summary(),
            },
        };
    }

    /** Forgets the recorded timings, to measure one scenario at a time. */
    resetTiming(): void {
        this.updateTimes.reset();
        this.composeTimes.reset();
        this.uploadTimes.reset();
        this.composeCounts.reset();
    }

    recordUpload(ms: number): void {
        this.uploadTimes.record(ms);
    }

    /**
     * Height at a local-space point, as the shaders compute it.
     *
     * @param x - Local-space X.
     * @param y - Local-space Y.
     * @returns The height in metres times the vertical scale.
     */
    heightAt(x: number, y: number): number {
        return heightAt(this, x, y);
    }

    update(centre: readonly [number, number]): void {
        if (!centre.every(Number.isFinite)) throw new Error('Terrain centre must be finite.');
        const updateStart = performance.now();
        const { crs, origin, source } = this.options;
        const count = this.zooms.length;
        const plans = this.zooms.map((zoom) =>
            planWindow({ crs, origin, scale: this.scale, zoom, tileSize: source.tileSize, size: this.windowSize, centre, padding: this.validation ? 6 : 1 }),
        );
        const moved = plans.map((plan, k) => {
            const old = this.plans[k];
            return !old || old.latticeX !== plan.latticeX || old.latticeY !== plan.latticeY;
        });

        this.store.beginFrame();
        if (moved.some(Boolean)) {
            // Coarsest level first; within a level, nearest the middle first.
            const ordered: TileIndex[] = [];
            for (let k = count - 1; k >= 0; k--) ordered.push(...sortByDistance(plans[k]!));
            this.store.update(ordered);
        }

        // A level reads its own tiles and, while any of its samples depends on a coarser zoom, the coarser
        // levels' tiles too. Its signature is its own ready flags, followed by the coarser signature
        // while it is incomplete. "Complete" means every own tile is ready and the last composition left
        // no sample depending on fallback: a loaded tile with nodata still wants coarser data.
        const ownFlags: string[] = new Array(count);
        const allReady: boolean[] = new Array(count);
        const coarserSignature: string[] = new Array(count);
        const signatures: string[] = new Array(count);
        let wanted = 0;
        let ready = 0;
        let failed = 0;
        let coarser = '';
        if (this.validation && plans[count - 1]!.zoom > source.minZoom) {
            const references = new Map<string, TileIndex>();
            for (const tile of plans[count - 1]!.tiles) {
                const parent = ancestorTile(tile, 1)!;
                references.set(`${parent.z}/${parent.x}/${parent.y}`, parent);
            }
            for (const tile of references.values()) coarser += this.store.get(tile)?.state === 'ready' ? '1' : '0';
        }
        for (let k = count - 1; k >= 0; k--) {
            let flags = '';
            let everyReady = true;
            for (const tile of plans[k]!.tiles) {
                wanted++;
                const entry = this.store.get(tile);
                const isReady = entry?.state === 'ready';
                if (entry?.state === 'missing') failed++;
                if (isReady) ready++;
                else everyReady = false;
                flags += isReady ? '1' : '0';
            }
            ownFlags[k] = flags;
            allReady[k] = everyReady;
            coarserSignature[k] = coarser;
            const complete = everyReady && this.composed[k]?.fallback === 0;
            signatures[k] = complete ? flags : `${flags}|${coarser}`;
            coarser = signatures[k]!;
        }
        this.wantedTiles = wanted;
        this.readyTiles = ready;
        this.failedTiles = failed;

        const lookup = (tile: TileIndex): DemTile | undefined => {
            const entry = this.store.get(tile);
            return entry?.state === 'ready' ? entry.value : undefined;
        };
        let changed = false;
        // Every GPU level needs valid metadata immediately, even while its samples are pending.
        for (let k = 0; k < count; k++) {
            if (!this.composed[k]) {
                const empty = composeWindow(plans[k]!, () => undefined);
                this.composed[k] = empty;
                this.levelData[k] = empty.level;
                this.plans[k] = plans[k];
                this.levelVersions[k] = ++this.counter;
                changed = true;
            }
            const job = this.jobs[k];
            if (job && (job.plan.latticeX !== plans[k]!.latticeX || job.plan.latticeY !== plans[k]!.latticeY)) {
                this.jobs[k] = undefined;
            }
        }
        const dirty: number[] = [];
        for (let k = 0; k < count; k++) {
            if (this.jobs[k] || moved[k] || signatures[k] !== this.signatures[k]) dirty.push(k);
        }
        dirty.sort((a, b) => this.waiting[b]! - this.waiting[a]! || b - a);

        let composeMs = 0;
        let composed = 0;
        let steps = 0;
        let pending = 0;
        for (const k of dirty) {
            if (steps > 0 && composeMs >= this.composeBudgetMs) {
                this.waiting[k]!++;
                pending++;
                continue;
            }
            const job = this.jobs[k] ??= {
                plan: plans[k]!, ownFlags: ownFlags[k]!,
                allReady: allReady[k]!, coarserSignature: coarserSignature[k]!, validationBytes: 0,
                steps: composeWindowSteps(plans[k]!, lookup, { verticalScale: this.verticalScale, minZoom: this.minZoom, validation: this.validation,
                    onValidationMemory: bytes => { const pending = this.jobs[k]; if (pending) pending.validationBytes = bytes; },
                }),
            };
            let result: IteratorResult<void, ComposedWindow>;
            do {
                const start = performance.now();
                result = job.steps.next();
                composeMs += performance.now() - start;
                steps++;
            } while (!result.done && composeMs < this.composeBudgetMs);
            if (!result.done) {
                this.waiting[k] = 0;
                pending++;
                continue;
            }
            this.waiting[k] = 0;
            composed++;
            const window = result.value;
            this.composed[k] = window;
            this.levelData[k] = window.level;
            this.plans[k] = job.plan;
            this.signatures[k] = job.allReady && window.fallback === 0 ? job.ownFlags : `${job.ownFlags}|${job.coarserSignature}`;
            this.jobs[k] = undefined;
            this.levelVersions[k] = ++this.counter;
            changed = true;
        }
        this.store.endFrame();
        this.pendingLevels = pending;
        // On-demand rendering draws only when asked, so ask for the frame that will compose the rest.
        // A completed snapshot may predate a tile arrival during its batches.
        // Recheck once after publishing, even when no scratch grid remains.
        if (pending > 0 || composed > 0) this.options.onChange?.();
        if (steps > 0) {
            this.composeTimes.record(composeMs);
            this.composeCounts.record(composed);
        }
        if (!changed) {
            this.updateTimes.record(performance.now() - updateStart);
            return;
        }

        let min = Infinity;
        let max = -Infinity;
        for (const window of this.composed) {
            if (!window) continue;
            // A sample without data is drawn at 0, so 0 belongs to the range while any exist.
            const lo = window.missing > 0 ? Math.min(window.min, 0) : window.min;
            const hi = window.missing > 0 ? Math.max(window.max, 0) : window.max;
            if (lo < min) min = lo;
            if (hi > max) max = hi;
        }
        this.minHeight = min;
        this.maxHeight = max;
        const outer = this.levelData[count - 1]!;
        this.bounds = [
            outer.originX,
            outer.originY,
            outer.originX + (outer.width - 1) * outer.cellSizeX,
            outer.originY + (outer.height - 1) * outer.cellSizeY,
        ];
        this.version = ++this.counter;
        this.updateTimes.record(performance.now() - updateStart);
    }

    destroy(): void {
        this.jobs.fill(undefined);
        this.store.destroy();
    }
}

/** The tiles of a window, nearest the middle of the window first. */
function sortByDistance(plan: WindowPlan): TileIndex[] {
    if (plan.tiles.length < 2) return [...plan.tiles];
    const xs = plan.tiles.map((t) => t.x);
    const ys = plan.tiles.map((t) => t.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    return [...plan.tiles].sort((a, b) => Math.hypot(a.x - midX, a.y - midY) - Math.hypot(b.x - midX, b.y - midY));
}
