/**
 * @module AutkMapTileFrame
 * Assembles the geometry of one frame of tiles.
 *
 * A frame is the visible tiles packed into one set of vertex and index arrays,
 * with one draw record per tile. A tile whose own image has not loaded is drawn
 * with the image of an ancestor: the tile keeps its own position and the
 * texture coordinates select the matching part of the ancestor. The module has
 * no WebGPU code; the draw record carries an opaque reference (a bind group,
 * in the layer) back to the caller.
 */

import type { TileIndex } from './tile-index';
import { uvInAncestor } from './tile-index';
import { buildTileGrid } from './tile-geometry';
import type { TileCrs } from './tile-projection';

/** One tile to draw and the image to draw it with. */
export interface FrameTile<R> {
    /** The tile whose area is drawn. */
    tile: TileIndex;
    /** Opaque reference to the image, handed back in the draw record. */
    ref: R;
    /** Zoom levels between the tile and the image: 0 or absent for the tile's own image. */
    levels?: number;
}

/** Where one tile's triangles sit in the frame arrays. */
export interface FrameDraw<R> {
    /** The reference given for the tile. */
    ref: R;
    /** First index in `indices`. */
    firstIndex: number;
    /** Value added to each index to reach the tile's vertices. */
    baseVertex: number;
    /** Number of indices. */
    indexCount: number;
}

/** Geometry of a frame. */
export interface TileFrame<R> {
    /** Vertex positions `[x, y]` relative to the map origin. */
    positions: Float32Array;
    /** Texture coordinates `[u, v]`, one per vertex. */
    texCoords: Float32Array;
    /** Triangle indices local to each tile; draw with `baseVertex`. */
    indices: Uint32Array;
    /** One record per tile, in the order given. */
    draws: Array<FrameDraw<R>>;
}

/**
 * Builds the geometry of a frame.
 *
 * @param items - Tiles to draw, each with its image.
 * @param crs - Coordinate system of the map.
 * @param origin - Map origin in that system.
 * @returns Packed vertex and index arrays with one draw record per tile.
 */
export function buildTileFrame<R>(
    items: readonly FrameTile<R>[],
    crs: TileCrs,
    origin: readonly [number, number],
): TileFrame<R> {
    const grids = items.map((item) => buildTileGrid(item.tile, crs, origin));
    const vertexCount = grids.reduce((n, g) => n + g.positions.length / 2, 0);
    const indexCount = grids.reduce((n, g) => n + g.indices.length, 0);

    const positions = new Float32Array(vertexCount * 2);
    const texCoords = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);
    const draws: Array<FrameDraw<R>> = [];

    let vertexOffset = 0;
    let indexOffset = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const grid = grids[i]!;
        const rect = item.levels ? uvInAncestor(item.tile, item.levels) : null;

        positions.set(grid.positions, vertexOffset * 2);
        if (rect) {
            const uv = new Float32Array(grid.texCoords.length);
            for (let k = 0; k < uv.length; k += 2) {
                uv[k] = rect.u0 + grid.texCoords[k]! * (rect.u1 - rect.u0);
                uv[k + 1] = rect.v0 + grid.texCoords[k + 1]! * (rect.v1 - rect.v0);
            }
            texCoords.set(uv, vertexOffset * 2);
        } else {
            texCoords.set(grid.texCoords, vertexOffset * 2);
        }
        indices.set(grid.indices, indexOffset);

        draws.push({ ref: item.ref, firstIndex: indexOffset, baseVertex: vertexOffset, indexCount: grid.indices.length });
        vertexOffset += grid.positions.length / 2;
        indexOffset += grid.indices.length;
    }

    return { positions, texCoords, indices, draws };
}
