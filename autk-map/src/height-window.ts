/**
 * @module height-window
 * One window of a height clipmap, composed on the CPU from elevation tiles.
 *
 * A window is a square grid of height samples in the map plane (the map's
 * coordinate system minus the shared origin). Its sample spacing is one
 * elevation-tile pixel of a chosen zoom, and its position snaps to a lattice of
 * whole samples, so a moving camera shifts it by whole samples and heights do
 * not swim.
 *
 * Tiles are EPSG:3857 and the map plane may be EPSG:3395 or EPSG:4326, so each
 * sample is placed by converting its map position to longitude and latitude and
 * then to a pixel of the tile pyramid. Longitude depends only on the column and
 * latitude only on the row, so the conversion is done per column and per row,
 * not per sample.
 */

import { DemSampler } from './dem-sample';
import type { DemTile } from './dem-decode';
import type { DemTileLookup } from './dem-sample';
import type { HeightLevel } from './height-source';
import { ancestorTile, lonLatToTileCoord, tileRangeInBounds, tilesInRange, tilesPerAxis } from './tile-index';
import type { TileIndex } from './tile-index';
import { EARTH_RADIUS, WEB_MERCATOR_EXTENT, crsToLonLat, latToMercatorY, lonLatToCrs } from './tile-projection';
import type { TileCrs } from './tile-projection';

const DEG = Math.PI / 180;

/** How far the map plane stretches, per 3857 metre, at the map origin. */
export interface CrsScale {
    /** Map units along x per 3857 metre. */
    readonly x: number;
    /** Map units along y per 3857 metre. */
    readonly y: number;
}

/**
 * Scale between a map coordinate system and EPSG:3857 at the map origin.
 *
 * Used to choose a window's cell size so the grid is square in the map plane.
 * The scale is taken at the origin once, so every window of a clipmap uses the
 * same one and the windows stay nested.
 *
 * @param crs - Coordinate system of the map plane.
 * @param origin - Map origin in `crs` units.
 * @returns The scale, `1` and `1` for EPSG:3857.
 * @throws Never throws.
 * @example
 * const scale = crsScaleAt('EPSG:3395', origin);
 */
export function crsScaleAt(crs: TileCrs, origin: readonly [number, number]): CrsScale {
    const delta = 1e-3;
    const [lon, lat] = crsToLonLat(crs, origin[0], origin[1]);
    const x0 = lonLatToCrs(crs, lon, lat)[0];
    const x1 = lonLatToCrs(crs, lon + delta, lat)[0];
    const y0 = lonLatToCrs(crs, lon, lat)[1];
    const y1 = lonLatToCrs(crs, lon, lat + delta)[1];
    return {
        x: (x1 - x0) / (EARTH_RADIUS * delta * DEG),
        y: (y1 - y0) / (latToMercatorY(lat + delta) - latToMercatorY(lat)),
    };
}

/** What a window needs to be placed. */
export interface WindowParams {
    /** Coordinate system of the map plane. */
    crs: TileCrs;
    /** Map origin in `crs` units. */
    origin: readonly [number, number];
    /** Scale from {@link crsScaleAt}. */
    scale: CrsScale;
    /** Tile zoom; a sample is one pixel of this zoom. */
    zoom: number;
    /** Pixels per tile edge. */
    tileSize: number;
    /** Samples along each edge of the window. */
    size: number;
    /** Local-space point the window is centred on (for example the camera's ground point). */
    centre: readonly [number, number];
}

/** A window's place and the tiles it needs. */
export interface WindowPlan {
    /** Zoom the window reads. */
    readonly zoom: number;
    /** Pixels per tile edge. */
    readonly tileSize: number;
    /** Coordinate system of the map plane. */
    readonly crs: TileCrs;
    /** Map origin in `crs` units. */
    readonly origin: readonly [number, number];
    /** Samples per edge. */
    readonly size: number;
    /** Local-space X of the first sample. */
    readonly originX: number;
    /** Local-space Y of the first sample. */
    readonly originY: number;
    /** Sample spacing along x, in map units. */
    readonly cellSizeX: number;
    /** Sample spacing along y, in map units. */
    readonly cellSizeY: number;
    /** Integer lattice index of the first sample along x (window position in whole cells). */
    readonly latticeX: number;
    /** Integer lattice index of the first sample along y. */
    readonly latticeY: number;
    /** Tiles at `zoom` that cover the window with one pixel to spare for interpolation. */
    readonly tiles: readonly TileIndex[];
}

/** Largest window the planner accepts: eight 2048² `r32float` levels are 128 MB of height texture. */
export const MAX_WINDOW_SIZE = 2048;

/** Allowance for how much the map plane can stretch a window's rows against the tile grid. */
const REPROJECTION_STRETCH = 1.05;

/**
 * Most tiles a single window can need, whatever its position.
 *
 * A window spans `size` samples, one cell of padding on each side, and the map
 * plane can stretch its rows a little against the tile grid; it can start
 * anywhere inside a tile, so it touches one more tile than its length covers.
 * Use it to size caches and request budgets before any window exists.
 *
 * @param size - Samples along a window edge.
 * @param tileSize - Pixels per tile edge.
 * @returns A bound on `plan.tiles.length`, never smaller than 4.
 * @throws Never throws.
 * @example
 * const perLevel = maxTilesPerWindow(512, 256); // 16
 */
export function maxTilesPerWindow(size: number, tileSize: number): number {
    const perAxis = Math.floor(((size + 2) * REPROJECTION_STRETCH) / tileSize) + 2;
    return perAxis * perAxis;
}

/**
 * Places a window: snaps it to the lattice of whole samples and lists its tiles.
 *
 * @param params - Where and how fine the window is.
 * @returns The plan.
 * @throws {Error} If `size` is not an even positive integer.
 * @example
 * const plan = planWindow({ crs: 'EPSG:3395', origin, scale, zoom: 12, tileSize: 256, size: 512, centre: [0, 0] });
 */
export function planWindow(params: WindowParams): WindowPlan {
    const { crs, origin, scale, zoom, tileSize, size, centre } = params;
    if (!Number.isInteger(size) || size <= 0 || size % 2 !== 0) {
        throw new Error(`A height window needs an even positive size, got ${size}.`);
    }
    if (size > MAX_WINDOW_SIZE) {
        throw new Error(`A height window can be at most ${MAX_WINDOW_SIZE} samples wide, got ${size}.`);
    }
    const metresPerPixel = (2 * WEB_MERCATOR_EXTENT) / (tileSize * tilesPerAxis(zoom));
    const cellSizeX = metresPerPixel * scale.x;
    const cellSizeY = metresPerPixel * scale.y;
    const latticeX = Math.round((origin[0] + centre[0]) / cellSizeX) - size / 2;
    const latticeY = Math.round((origin[1] + centre[1]) / cellSizeY) - size / 2;

    // One extra cell on every side: interpolation reads the next pixel over.
    const west = crsToLonLat(crs, (latticeX - 1) * cellSizeX, 0)[0];
    const east = crsToLonLat(crs, (latticeX + size) * cellSizeX, 0)[0];
    const south = crsToLonLat(crs, 0, (latticeY - 1) * cellSizeY)[1];
    const north = crsToLonLat(crs, 0, (latticeY + size) * cellSizeY)[1];
    const range = tileRangeInBounds({ west, south, east, north }, zoom);

    return {
        zoom,
        tileSize,
        crs,
        origin,
        size,
        originX: latticeX * cellSizeX - origin[0],
        originY: latticeY * cellSizeY - origin[1],
        cellSizeX,
        cellSizeY,
        latticeX,
        latticeY,
        tiles: range ? tilesInRange(range) : [],
    };
}

/** Options for {@link composeWindow}. */
export interface ComposeOptions {
    /** Multiplies every height. Defaults to 1. */
    verticalScale?: number;
    /** Height used where no tile has data. Defaults to 0. */
    fill?: number;
    /** Coarsest zoom a sample may fall back to. Defaults to 0. */
    minZoom?: number;
}

/** A composed window. */
export interface ComposedWindow {
    /** The window as a height level, ready for a {@link HeightSource}. */
    readonly level: HeightLevel;
    /** Lowest height among samples that had data, or 0 when none did. */
    readonly min: number;
    /** Highest height among samples that had data, or 0 when none did. */
    readonly max: number;
    /** Samples that no loaded tile covered and so took the fill value. */
    readonly missing: number;
    /**
     * Samples whose value depends on a coarser zoom, or that have none: they read a coarser
     * tile, or had a missing or nodata pixel filled from one. A window with `fallback > 0`
     * can change when a coarser tile arrives, even if all of its own tiles have loaded.
     */
    readonly fallback: number;
}

/**
 * Fills a window with heights from loaded elevation tiles.
 *
 * Each sample is read bilinearly at its own position, falling back to coarser
 * tiles where finer ones have not loaded (see {@link DemSampler}). Compose again
 * when a tile of the plan arrives or the plan changes; `missing` says whether
 * more is expected.
 *
 * @param plan - Window from {@link planWindow}.
 * @param lookup - Finds a loaded tile.
 * @param options - Vertical scale, fill value and fallback limit.
 * @returns The window and its statistics.
 * @throws Never throws for missing tiles.
 * @example
 * const { level, missing } = composeWindow(plan, (tile) => store.get(tile)?.value);
 */
export function composeWindow(plan: WindowPlan, lookup: DemTileLookup, options: ComposeOptions = {}): ComposedWindow {
    const { size, zoom, tileSize, crs } = plan;
    const verticalScale = options.verticalScale ?? 1;
    const fill = options.fill ?? 0;
    const minZoom = options.minZoom ?? 0;
    const worldPixels = tilesPerAxis(zoom) * tileSize;

    const data = new Float32Array(size * size);
    const level: HeightLevel = {
        originX: plan.originX,
        originY: plan.originY,
        cellSizeX: plan.cellSizeX,
        cellSizeY: plan.cellSizeY,
        width: size,
        height: size,
        data,
    };

    // Which zooms have any loaded tile under the window? Fallback skips the others.
    const usable: boolean[] = [];
    let anyUsable = false;
    const grid = new Map<number, DemTile>();
    for (let z = zoom; z >= minZoom; z--) {
        const shift = zoom - z;
        let found = false;
        for (const tile of plan.tiles) {
            const ancestor = ancestorTile(tile, shift)!; // shift <= zoom, so there is one
            const value = lookup(ancestor);
            if (value) {
                found = true;
                if (z === zoom) grid.set(tile.x * 4194304 + tile.y, value);
            }
        }
        usable[z] = found;
        anyUsable ||= found;
    }
    if (!anyUsable) {
        // Nothing to read at any zoom: the whole window is missing.
        if (fill !== 0) data.fill(fill);
        return { level, min: 0, max: 0, missing: size * size, fallback: size * size };
    }

    // Per-column source coordinates, and for the fast path the tile column and pixel.
    const columns = new Float64Array(size);
    const colFu = new Float64Array(size);
    const colTx = new Int32Array(size);
    const colLi = new Int32Array(size);
    const span = worldPixels;
    for (let i = 0; i < size; i++) {
        const lon = crsToLonLat(crs, (plan.latticeX + i) * plan.cellSizeX, 0)[0];
        const px = lonLatToTileCoord(lon, 0, zoom).x * tileSize;
        columns[i] = px;
        const u = px - 0.5;
        const i0 = Math.floor(u);
        colFu[i] = u - i0;
        // Fast only when both pixels read lie in one tile inside the world.
        const li = i0 - Math.floor(i0 / tileSize) * tileSize;
        colTx[i] = i0 >= 0 && i0 + 1 < span && li < tileSize - 1 ? Math.floor(i0 / tileSize) : -1;
        colLi[i] = li;
    }

    const sampler = new DemSampler(lookup, tileSize);
    sampler.setUsableZooms(usable);
    let min = Infinity;
    let max = -Infinity;
    let missing = 0;
    let fallback = 0;

    for (let j = 0; j < size; j++) {
        const lat = crsToLonLat(crs, 0, (plan.latticeY + j) * plan.cellSizeY)[1];
        const py = lonLatToTileCoord(0, lat, zoom).y * tileSize;
        const v = py - 0.5;
        const j0 = Math.floor(v);
        const fv = v - j0;
        const ty = Math.floor(j0 / tileSize);
        const lj = j0 - ty * tileSize;
        const rowFast = j0 >= 0 && j0 + 1 < span && lj < tileSize - 1;
        let tile: DemTile | undefined;
        let tileX = -2;
        const row = j * size;
        for (let i = 0; i < size; i++) {
            let height = NaN;
            const tx = colTx[i]!;
            if (rowFast && tx >= 0) {
                if (tx !== tileX) {
                    tileX = tx;
                    tile = grid.get(tx * 4194304 + ty);
                }
                if (tile) {
                    const at = lj * tileSize + colLi[i]!;
                    const fu = colFu[i]!;
                    const h = tile.heights;
                    // Same formula as `bilerp`, written out: calling it here costs about a third more per window (measured).
                    const bottom = h[at]! * (1 - fu) + h[at + 1]! * fu;
                    const top = h[at + tileSize]! * (1 - fu) + h[at + tileSize + 1]! * fu;
                    height = bottom * (1 - fv) + top * fv;
                }
            }
            // Tile edges, missing tiles and nodata take the general path.
            if (height !== height) {
                height = sampler.sample(zoom, columns[i]!, py, minZoom);
                if (sampler.usedFallback) fallback++;
            }
            if (height !== height) {
                data[row + i] = fill;
                missing++;
                continue;
            }
            const scaled = height * verticalScale;
            data[row + i] = scaled;
            if (scaled < min) min = scaled;
            if (scaled > max) max = scaled;
        }
    }
    if (min > max) {
        min = 0;
        max = 0;
    }
    return { level, min, max, missing, fallback };
}
