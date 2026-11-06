/**
 * @module AutkMapTileGeometry
 * Vertex data for drawing one map tile.
 *
 * A tile is a quad whose corners are placed in the map coordinate system. The
 * texture is sampled linearly in the tile's own Web Mercator (EPSG:3857)
 * space, so the image lines up with the map as long as the quad follows the
 * map's y axis closely enough between its corners.
 *
 * For EPSG:3857 maps one quad is exact. For EPSG:3395 the corners carry the
 * kilometres-wide offset between the two systems and the shape between them
 * is almost linear, so a quad is within a fraction of a pixel at every zoom
 * except the first few. EPSG:4326 stretches latitude non-linearly, so low
 * zoom tiles are split into rows, each with its own Mercator texture V.
 */

import type { TileIndex } from './tile-index';
import { tilesPerAxis } from './tile-index';
import type { TileCrs } from './tile-projection';
import { WEB_MERCATOR_EXTENT, lonLatToCrs, mercatorYToLat } from './tile-projection';

/** Vertex and index data for one tile. */
export interface TileGrid {
    /** `[x, y]` per vertex, relative to the map origin, in map units. */
    positions: Float32Array;
    /** `[u, v]` per vertex; `v` is 0 at the north edge and 1 at the south edge. */
    texCoords: Float32Array;
    /** Triangle list over the vertices. */
    indices: Uint16Array;
    /** Number of quad rows the tile is split into. */
    rows: number;
}

/**
 * Rows per tile by zoom level, from zoom 0, that keep the quad within 1/8 of
 * a pixel of the true projection for tiles up to 512 pixels. Zooms beyond the
 * table use one row.
 */
const ROWS_BY_ZOOM: Record<TileCrs, readonly number[]> = {
    'EPSG:3857': [],
    'EPSG:3395': [4, 4, 2, 2, 2],
    'EPSG:4326': [64, 64, 64, 32, 16, 16, 8, 8, 4, 4, 2, 2],
};

/**
 * Number of rows a tile is split into.
 *
 * @param crs - Map coordinate system.
 * @param z - Zoom level.
 * @returns A positive integer.
 */
export function tileRowCount(crs: TileCrs, z: number): number {
    return ROWS_BY_ZOOM[crs][z] ?? 1;
}

/**
 * Builds the vertices of a tile.
 *
 * Positions are computed in double precision and rounded to float32 only
 * after the origin is subtracted. Vertices on a shared edge come from the same
 * arithmetic on both tiles, so neighbours meet exactly.
 *
 * @param tile - Tile address.
 * @param crs - Map coordinate system.
 * @param origin - Map origin, in the units of `crs`, that positions are relative to.
 * @returns Positions, texture coordinates and indices.
 * @example
 * const grid = buildTileGrid({ z: 3, x: 4, y: 2 }, 'EPSG:3395', [0, 0]);
 */
export function buildTileGrid(tile: TileIndex, crs: TileCrs, origin: readonly [number, number]): TileGrid {
    const rows = tileRowCount(crs, tile.z);
    const n = tilesPerAxis(tile.z);
    const size = (2 * WEB_MERCATOR_EXTENT) / n;
    const west = (tile.x / n) * 360 - 180;
    const east = ((tile.x + 1) / n) * 360 - 180;

    const positions = new Float32Array((rows + 1) * 4);
    const texCoords = new Float32Array((rows + 1) * 4);
    const indices = new Uint16Array(rows * 6);

    for (let r = 0; r <= rows; r++) {
        const lat = mercatorYToLat(WEB_MERCATOR_EXTENT - (tile.y + r / rows) * size);
        const [x0, y] = lonLatToCrs(crs, west, lat);
        const [x1] = lonLatToCrs(crs, east, lat);
        const v = r / rows;
        const i = r * 4;
        positions[i] = x0 - origin[0];
        positions[i + 1] = y - origin[1];
        positions[i + 2] = x1 - origin[0];
        positions[i + 3] = y - origin[1];
        texCoords[i] = 0;
        texCoords[i + 1] = v;
        texCoords[i + 2] = 1;
        texCoords[i + 3] = v;
    }

    for (let r = 0; r < rows; r++) {
        const a = r * 2;
        indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], r * 6);
    }

    return { positions, texCoords, indices, rows };
}
