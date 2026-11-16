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
 * Other Proj4js projections use a two-dimensional grid so convergence, rotation,
 * and nonlinear changes in both coordinates are retained.
 */

import type { TileIndex } from './tile-index';
import { tileLonLatBounds, tilesPerAxis } from './tile-index';
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
    return ROWS_BY_ZOOM[crs]?.[z] ?? (ROWS_BY_ZOOM[crs] ? 1 : 16);
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
    const columns = ROWS_BY_ZOOM[crs] ? 1 : rows;
    const n = tilesPerAxis(tile.z);
    const size = (2 * WEB_MERCATOR_EXTENT) / n;
    const { west, east } = tileLonLatBounds(tile);

    const positions = new Float32Array((rows + 1) * (columns + 1) * 2);
    const texCoords = new Float32Array(positions.length);
    const indices = new Uint16Array(rows * columns * 6);

    for (let r = 0; r <= rows; r++) {
        const lat = mercatorYToLat(WEB_MERCATOR_EXTENT - (tile.y + r / rows) * size);
        for (let column = 0; column <= columns; column++) {
            const u = column / columns;
            const [x, y] = lonLatToCrs(crs, column === columns ? east : west + (east - west) * u, lat);
            const at = (r * (columns + 1) + column) * 2;
            positions[at] = x - origin[0];
            positions[at + 1] = y - origin[1];
            texCoords[at] = u;
            texCoords[at + 1] = r / rows;
        }
    }

    for (let r = 0; r < rows; r++) for (let column = 0; column < columns; column++) {
        const a = r * (columns + 1) + column;
        const b = a + columns + 1;
        indices.set([a, a + 1, b, a + 1, b + 1, b], (r * columns + column) * 6);
    }

    return { positions, texCoords, indices, rows };
}
