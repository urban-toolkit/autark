/**
 * @module dem-sample
 * Bilinear sampling of elevation tiles in global pixel coordinates.
 *
 * At zoom `z` the world is `2^z * tileSize` pixels on each side. A position is
 * a continuous pixel coordinate where the centre of pixel `i` is `i + 0.5`, so
 * a sample can read across a tile edge: the neighbouring tile supplies the
 * pixels on the other side, and tiles need no overlap.
 *
 * When a tile is not loaded the sampler falls back to coarser zooms: a missing
 * pixel takes the coarser height at its own centre, and a sample whose four
 * pixels are all missing reads the coarser zoom directly. Both give the same
 * surface up to the coarser data's own curvature, so heights stay continuous
 * while detail streams in.
 */

import type { DemTile } from './dem-decode';
import { DemValidator } from './dem-validation';
import type { ElevationValidationStats, ResolvedElevationValidation } from '@urban-toolkit/autk-core';
import type { TileIndex } from './tile-index';
import { bilerp, clamp } from '@urban-toolkit/autk-core';

/** Finds a loaded tile, or `undefined` when it is not available. */
export type DemTileLookup = (tile: TileIndex) => DemTile | undefined;

/**
 * Samples elevation tiles. Make one per batch of samples: it remembers the
 * tiles it has looked up, so neighbouring samples do not search again.
 *
 * @example
 * const sampler = new DemSampler(lookup, 256);
 * const metres = sampler.sample(12, px, py);
 */
export class DemSampler {
    private readonly cache = new Map<number, DemTile | undefined>();
    private lastKey = -1;
    private lastTile: DemTile | undefined;
    private usable: readonly boolean[] | undefined;
    private readonly validator?: DemValidator;
    /** After {@link DemSampler.sample}: `true` when the value came from a coarser zoom or a pixel was filled from one, or there was none. */
    usedFallback = false;

    /**
     * @param lookup - Finds a loaded tile.
     * @param tileSize - Pixels per tile edge; every tile must have it.
     */
    constructor(
        private readonly lookup: DemTileLookup,
        private readonly tileSize: number,
        validation?: ResolvedElevationValidation,
        memory?: (bytes: number) => void,
    ) {
        if (validation) this.validator = new DemValidator(tileSize, validation,
            (z, x, y) => this.tile(z, x, y), (z, i, j) => this.rawTexel(z, i, j),
            (z, px, py, minZoom) => this.fromCoarser(z, px, py, minZoom), () => { this.usedFallback = true; }, memory);
    }

    get validationStats(): ElevationValidationStats | undefined { return this.validator ? { ...this.validator.stats } : undefined; }

    /**
     * Tells the sampler which zooms can have data, so fallback does not search the others.
     *
     * @param usable - Indexed by zoom: `false` means no tile of that zoom is loaded where samples will be taken.
     * @returns Nothing.
     */
    setUsableZooms(usable: readonly boolean[]): void {
        this.usable = usable;
    }

    /**
     * Height at a continuous pixel position.
     *
     * Tries zoom `z` first and then each coarser zoom down to `minZoom`. At a zoom
     * the four surrounding pixels are read. A pixel that is missing (its tile is
     * not loaded, or it has no data) takes the height of the next coarser zoom at
     * that pixel's centre, so the result is one continuous surface even where
     * fine data ends; when all four are missing the zoom is skipped.
     *
     * @param z - Zoom of the wanted position.
     * @param px - Pixel x at zoom `z`, from the west edge of the world.
     * @param py - Pixel y at zoom `z`, from the north edge of the world.
     * @param minZoom - Coarsest zoom to fall back to. Defaults to 0.
     * @returns The height in metres, or `NaN` when no zoom has data there.
     * @throws Never throws.
     */
    sample(z: number, px: number, py: number, minZoom = 0): number {
        this.usedFallback = false;
        for (let zoom = z; zoom >= minZoom; zoom--) {
            if (this.usable && this.usable[zoom] === false) continue;
            const scale = 2 ** (z - zoom);
            const value = this.bilinear(zoom, px / scale, py / scale, minZoom);
            if (!Number.isNaN(value)) {
                if (zoom < z) this.usedFallback = true;
                return value;
            }
        }
        this.usedFallback = true;
        return NaN;
    }

    private bilinear(z: number, px: number, py: number, minZoom: number): number {
        const u = px - 0.5;
        const v = py - 0.5;
        const i0 = Math.floor(u);
        const j0 = Math.floor(v);
        const fu = u - i0;
        const fv = v - j0;
        let a = this.texel(z, i0, j0, minZoom);
        let b = this.texel(z, i0 + 1, j0, minZoom);
        let c = this.texel(z, i0, j0 + 1, minZoom);
        let d = this.texel(z, i0 + 1, j0 + 1, minZoom);
        const aMissing = a !== a;
        const bMissing = b !== b;
        const cMissing = c !== c;
        const dMissing = d !== d;
        // All four missing: this zoom has nothing here, the caller moves to the next coarser zoom.
        if (aMissing && bMissing && cMissing && dMissing) return NaN;
        if (aMissing || bMissing || cMissing || dMissing) {
            this.usedFallback = true;
            // Some pixels are missing (tile not loaded, or no data). Each takes the coarser zoom's height at
            // its own centre, so the four pixels are one fixed field and the result cannot jump where fine
            // data ends. Where no coarser zoom has data it takes the nearest present pixel, and if the nearest pixel itself is missing there is no value at this zoom.
            // The pixel the sample is nearest to; it stands in for others when no coarser zoom helps.
            const nearestMissing = fu < 0.5 ? (fv < 0.5 ? aMissing : cMissing) : fv < 0.5 ? bMissing : dMissing;
            const nearest = fu < 0.5 ? (fv < 0.5 ? a : c) : fv < 0.5 ? b : d;
            const fill = (i: number, j: number): number => {
                const coarser = this.fromCoarser(z, i + 0.5, j + 0.5, minZoom);
                return coarser === coarser ? coarser : nearest;
            };
            const a1 = aMissing ? fill(i0, j0) : a;
            const b1 = bMissing ? fill(i0 + 1, j0) : b;
            const c1 = cMissing ? fill(i0, j0 + 1) : c;
            const d1 = dMissing ? fill(i0 + 1, j0 + 1) : d;
            // No coarser data under a pixel nothing can fill: this zoom has no value here.
            if (nearestMissing && (a1 !== a1 || b1 !== b1 || c1 !== c1 || d1 !== d1)) return NaN;
            a = a1;
            b = b1;
            c = c1;
            d = d1;
        }
        return bilerp(a, b, c, d, fu, fv);
    }

    /** Height at pixel position `(px, py)` of zoom `z` read from the coarser zooms only, or `NaN`. */
    private fromCoarser(z: number, px: number, py: number, minZoom: number): number {
        for (let zoom = z - 1; zoom >= minZoom; zoom--) {
            if (this.usable && this.usable[zoom] === false) continue;
            const scale = 2 ** (z - zoom);
            const value = this.bilinear(zoom, px / scale, py / scale, minZoom);
            if (value === value) return value;
        }
        return NaN;
    }

    /** One pixel of the world at zoom `z`. The world wraps in x and clamps in y. */
    private texel(z: number, i: number, j: number, minZoom: number): number {
        return this.validator ? this.validator.read(z, i, j, minZoom) : this.rawTexel(z, i, j);
    }

    private rawTexel(z: number, i: number, j: number): number {
        const size = this.tileSize;
        const span = 2 ** z * size;
        const wrappedI = ((i % span) + span) % span;
        const clampedJ = clamp(j, 0, span - 1);
        const x = Math.floor(wrappedI / size);
        const y = Math.floor(clampedJ / size);
        const tile = this.tile(z, x, y);
        if (!tile) return NaN;
        return tile.heights[(clampedJ - y * size) * size + (wrappedI - x * size)]!;
    }

    private tile(z: number, x: number, y: number): DemTile | undefined {
        // Numeric key: z < 32 and x, y < 2^22 fit in 53 bits. Building strings here dominated compose time.
        const key = (z * 4194304 + x) * 4194304 + y;
        if (key === this.lastKey) return this.lastTile;
        let tile: DemTile | undefined;
        if (this.cache.has(key)) {
            tile = this.cache.get(key);
        } else {
            tile = this.lookup({ z, x, y });
            if (tile && tile.size !== this.tileSize) {
                throw new Error(`Elevation tile ${z}/${x}/${y} is ${tile.size} pixels wide, expected ${this.tileSize}.`);
            }
            this.cache.set(key, tile);
        }
        this.lastKey = key;
        this.lastTile = tile;
        return tile;
    }
}
