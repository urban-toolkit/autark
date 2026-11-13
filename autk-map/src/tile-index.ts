/**
 * @module AutkMapTileIndex
 * Tile addressing and tile geometry for the Web Mercator tile grid.
 *
 * Tiles follow the common XYZ ("slippy map") scheme: zoom `z` splits the world
 * square into `2^z × 2^z` tiles, `x` counts from the west edge and `y` from the
 * north edge. These are the tiles served by OpenStreetMap, Esri and most
 * other providers.
 */

import { EARTH_RADIUS, WEB_MERCATOR_EXTENT, clampLatitude, latToMercatorY, mercatorYToLat } from './tile-projection';

/** Address of one tile in the XYZ scheme. */
export interface TileIndex {
    /** Zoom level; `0` is the single tile covering the world. */
    z: number;
    /** Column from the west edge, in `[0, 2^z)`. */
    x: number;
    /** Row from the north edge, in `[0, 2^z)`. */
    y: number;
}

/** Longitude/latitude bounds in degrees. */
export interface LonLatBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

/** Largest zoom level supported; `2^30` tiles per axis still fits integer math. */
export const MAX_TILE_ZOOM = 30;

/**
 * Number of tiles along one axis at a zoom level.
 *
 * @param z - Zoom level.
 * @returns `2^z`.
 */
export function tilesPerAxis(z: number): number {
    return 2 ** z;
}

/**
 * Tells whether a tile address is inside the grid.
 *
 * @param tile - Tile to test.
 * @returns `true` when `z`, `x` and `y` are integers within the grid.
 */
export function isValidTile(tile: TileIndex): boolean {
    const { z, x, y } = tile;
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (z < 0 || z > MAX_TILE_ZOOM) return false;
    const n = tilesPerAxis(z);
    return x >= 0 && x < n && y >= 0 && y < n;
}

/**
 * Builds a stable cache key for a tile of a source.
 *
 * @param sourceId - Identifier of the tile source.
 * @param tile - Tile address.
 * @returns `"sourceId/z/x/y"`.
 */
export function tileKey(sourceId: string, tile: TileIndex): string {
    return `${sourceId}/${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Parent tile, one zoom level up.
 *
 * @param tile - Tile address.
 * @returns The parent, or `null` for the zoom-0 tile.
 */
export function parentTile(tile: TileIndex): TileIndex | null {
    if (tile.z <= 0) return null;
    return { z: tile.z - 1, x: tile.x >> 1, y: tile.y >> 1 };
}

/**
 * Ancestor tile some zoom levels up.
 *
 * @param tile - Tile address.
 * @param levels - How many zoom levels to climb.
 * @returns The ancestor, or `null` when it would be above zoom 0.
 */
export function ancestorTile(tile: TileIndex, levels: number): TileIndex | null {
    if (levels < 0 || levels > tile.z) return null;
    return { z: tile.z - levels, x: Math.floor(tile.x / 2 ** levels), y: Math.floor(tile.y / 2 ** levels) };
}

/**
 * Where a tile sits inside one of its ancestors, as a UV rectangle.
 *
 * Drawing the child's area with the ancestor's texture means sampling that
 * texture over the returned rectangle. `v` runs top to bottom, like the image.
 *
 * @param tile - The (descendant) tile.
 * @param levels - How many zoom levels up the ancestor is.
 * @returns `{ u0, v0, u1, v1 }` in `[0, 1]`, or `null` when there is no such ancestor.
 */
export function uvInAncestor(
    tile: TileIndex,
    levels: number,
): { u0: number; v0: number; u1: number; v1: number } | null {
    const ancestor = ancestorTile(tile, levels);
    if (!ancestor) return null;
    const span = 2 ** levels;
    const u0 = tile.x / span - ancestor.x;
    const v0 = tile.y / span - ancestor.y;
    return { u0, v0, u1: u0 + 1 / span, v1: v0 + 1 / span };
}

/**
 * Longitude/latitude bounds of a tile.
 *
 * @param tile - Tile address.
 * @returns Bounds in degrees.
 */
export function tileLonLatBounds(tile: TileIndex): LonLatBounds {
    const n = tilesPerAxis(tile.z);
    return {
        west: (tile.x / n) * 360 - 180,
        east: ((tile.x + 1) / n) * 360 - 180,
        north: mercatorYToLat(WEB_MERCATOR_EXTENT - (tile.y / n) * 2 * WEB_MERCATOR_EXTENT),
        south: mercatorYToLat(WEB_MERCATOR_EXTENT - ((tile.y + 1) / n) * 2 * WEB_MERCATOR_EXTENT),
    };
}

/**
 * Spherical Mercator (EPSG:3857) bounds of a tile.
 *
 * @param tile - Tile address.
 * @returns Bounds in metres, with `minY` in the south.
 */
export function tileMercatorBounds(tile: TileIndex): { minX: number; minY: number; maxX: number; maxY: number } {
    const n = tilesPerAxis(tile.z);
    const size = (2 * WEB_MERCATOR_EXTENT) / n;
    return {
        minX: -WEB_MERCATOR_EXTENT + tile.x * size,
        maxX: -WEB_MERCATOR_EXTENT + (tile.x + 1) * size,
        maxY: WEB_MERCATOR_EXTENT - tile.y * size,
        minY: WEB_MERCATOR_EXTENT - (tile.y + 1) * size,
    };
}

/**
 * Fractional tile coordinates of a longitude/latitude.
 *
 * @param lon - Longitude in degrees.
 * @param lat - Latitude in degrees, clamped to the Web Mercator range.
 * @param z - Zoom level.
 * @returns `{ x, y }` where the integer parts are the tile and the fractions the position inside it.
 */
export function lonLatToTileCoord(lon: number, lat: number, z: number): { x: number; y: number } {
    const n = tilesPerAxis(z);
    return {
        x: ((lon + 180) / 360) * n,
        y: ((WEB_MERCATOR_EXTENT - latToMercatorY(clampLatitude(lat))) / (2 * WEB_MERCATOR_EXTENT)) * n,
    };
}

/** An inclusive rectangle of tiles at one zoom level. */
export interface TileRange {
    /** Zoom level. */
    z: number;
    /** First column. */
    x0: number;
    /** Last column. */
    x1: number;
    /** First row. */
    y0: number;
    /** Last row. */
    y1: number;
}

/**
 * The tiles that overlap a longitude/latitude box at one zoom level, as a
 * rectangle. This costs the same however many tiles the box holds, so a caller
 * can count them before deciding to list them.
 *
 * The box is clamped to the world square. A box that crosses the antimeridian
 * is not wrapped: pass `west > east` as two calls if that is needed.
 *
 * @param bounds - Box in degrees.
 * @param z - Zoom level.
 * @returns The range, or `null` when the box overlaps no tile.
 */
export function tileRangeInBounds(bounds: LonLatBounds, z: number): TileRange | null {
    const n = tilesPerAxis(z);
    const nw = lonLatToTileCoord(bounds.west, bounds.north, z);
    const se = lonLatToTileCoord(bounds.east, bounds.south, z);
    // A box that ends exactly on a tile edge does not include the next tile.
    const epsilon = 1e-9;
    const x0 = Math.max(0, Math.floor(nw.x + epsilon));
    const x1 = Math.min(n - 1, Math.ceil(se.x - epsilon) - 1);
    const y0 = Math.max(0, Math.floor(nw.y + epsilon));
    const y1 = Math.min(n - 1, Math.ceil(se.y - epsilon) - 1);
    return x1 < x0 || y1 < y0 ? null : { z, x0, x1, y0, y1 };
}

/**
 * Number of tiles in a range.
 *
 * @param range - Tile range.
 * @returns Columns times rows.
 */
export function tileRangeCount(range: TileRange): number {
    return (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
}

/**
 * Lists the tiles of a range.
 *
 * @param range - Tile range.
 * @returns Tiles in row-major order, north to south and west to east.
 */
export function tilesInRange(range: TileRange): TileIndex[] {
    const tiles: TileIndex[] = [];
    for (let y = range.y0; y <= range.y1; y++) {
        for (let x = range.x0; x <= range.x1; x++) tiles.push({ z: range.z, x, y });
    }
    return tiles;
}

/**
 * Tiles that overlap a longitude/latitude box at one zoom level.
 *
 * Lists every tile, so check {@link tileRangeInBounds} first when the box may be large.
 *
 * @param bounds - Box in degrees.
 * @param z - Zoom level.
 * @returns Tiles in row-major order, north to south and west to east.
 */
export function tilesInBounds(bounds: LonLatBounds, z: number): TileIndex[] {
    const range = tileRangeInBounds(bounds, z);
    return range ? tilesInRange(range) : [];
}

/**
 * Ground distance covered by one pixel of a tile, at a latitude.
 *
 * @param z - Zoom level.
 * @param lat - Latitude in degrees.
 * @param tileSize - Tile edge in pixels. Defaults to 256.
 * @returns Metres per pixel along the ground.
 */
export function metresPerPixel(z: number, lat: number, tileSize = 256): number {
    return (2 * Math.PI * EARTH_RADIUS * Math.cos(clampLatitude(lat) * (Math.PI / 180))) / (tileSize * tilesPerAxis(z));
}
