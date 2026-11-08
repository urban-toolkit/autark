/**
 * @module height-source
 * Height data that terrain rendering, building placement and picking sample.
 *
 * A height source is a stack of one or more windows (levels) of height samples
 * in the map's local space. Every consumer reads the same GPU texture array and
 * the same uniform table through one shared WGSL function
 * (`shaders/height-lookup.wgsl`), so they agree on the height at any point.
 * A fixed heightfield (for example from a GeoTIFF) is a source with one level.
 */

import type { Heightfield } from '@urban-toolkit/autk-core';
import { bilerp, clamp } from './utils-math';

/** Most levels a height source may have; the WGSL uniform table holds this many. */
export const MAX_HEIGHT_LEVELS = 8;

/** Floats in the uniform header (level count, enabled flag, two spares). */
const HEADER_FLOATS = 4;
/** Floats per level in the uniform table (two `vec4`s). */
const LEVEL_FLOATS = 8;
/** Floats in a packed height uniform. */
export const HEIGHT_UNIFORM_FLOATS = HEADER_FLOATS + MAX_HEIGHT_LEVELS * LEVEL_FLOATS;
/** Bytes in a packed height uniform. */
export const HEIGHT_UNIFORM_BYTES = HEIGHT_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/** One window of height samples, placed in local space. */
export interface HeightLevel {
    /** Local-space X of the first sample. */
    originX: number;
    /** Local-space Y of the first sample. */
    originY: number;
    /** Distance between adjacent samples along X. */
    cellSizeX: number;
    /** Distance between adjacent samples along Y. */
    cellSizeY: number;
    /** Samples along X. */
    width: number;
    /** Samples along Y. */
    height: number;
    /** Row-major height samples, `width * height` long. */
    data: Float32Array;
}

/** Height data shared by terrain rendering, buildings and picking. */
export interface HeightSource {
    /** Windows from finest to coarsest, at most {@link MAX_HEIGHT_LEVELS}. */
    readonly levels: readonly HeightLevel[];
    /** Local-space extent of the terrain as `[minX, minY, maxX, maxY]`. */
    readonly bounds: readonly [number, number, number, number];
    /** Lowest height; never above the true minimum, so culling stays safe. */
    readonly minHeight: number;
    /** Highest height; never below the true maximum. */
    readonly maxHeight: number;
    /** Changes whenever anything about the source changes (data, window positions, bounds, range). */
    readonly version: number;
    /** Per level, changes whenever that level's samples or placement change, so only changed levels are uploaded. */
    readonly levelVersions: readonly number[];
}

/**
 * A height source whose levels follow the view and fill in as tiles arrive.
 *
 * The terrain path calls {@link StreamingHeightSource.update} once per frame,
 * before drawing. The number of levels and the size of each window never change.
 */
export interface StreamingHeightSource extends HeightSource {
    /**
     * Moves the windows to the view and composes what changed.
     *
     * @param centre - Local-space point to centre the windows on, usually the ground point at the view centre.
     * @returns Nothing; read {@link HeightSource.version} to see whether anything changed.
     */
    update(centre: readonly [number, number]): void;
    /** Cancels loading and releases everything held. */
    destroy(): void;
    /**
     * Called by the renderer after it uploads changed levels to the GPU, for diagnostics.
     *
     * @param ms - CPU milliseconds spent submitting the upload (not GPU completion).
     */
    recordUpload?(ms: number): void;
}

/**
 * Tells whether a height source streams.
 *
 * @param source - Source to test.
 * @returns `true` when it has `update` and `destroy`.
 */
export function isStreamingHeightSource(source: HeightSource): source is StreamingHeightSource {
    const candidate = source as Partial<StreamingHeightSource>;
    return typeof candidate.update === 'function' && typeof candidate.destroy === 'function';
}

/**
 * A height source over one fixed heightfield.
 *
 * @example
 * const source = new StaticHeightSource(heightfield);
 */
export class StaticHeightSource implements HeightSource {
    readonly levels: readonly HeightLevel[];
    readonly bounds: readonly [number, number, number, number];
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly version = 0;
    readonly levelVersions: readonly number[] = [0];

    /**
     * @param heightfield - Heightfield to wrap. Its data is shared, not copied.
     * @throws Never throws.
     */
    constructor(readonly heightfield: Heightfield) {
        this.levels = [
            {
                originX: heightfield.originX,
                originY: heightfield.originY,
                cellSizeX: heightfield.cellSizeX,
                cellSizeY: heightfield.cellSizeY,
                width: heightfield.width,
                height: heightfield.height,
                data: heightfield.data,
            },
        ];
        this.bounds = heightfield.bounds;
        this.minHeight = heightfield.minHeight;
        this.maxHeight = heightfield.maxHeight;
    }
}

/**
 * Writes a source into the uniform layout `shaders/height-lookup.wgsl` reads.
 *
 * Layout in floats: `[levelCount, enabled, 0, 0]`, then per level
 * `[originX, originY, cellSizeX, cellSizeY]` and `[width, height, 0, 0]`.
 *
 * @param source - Source to describe, or `null` for "no terrain" (heights read as zero).
 * @param out - Destination of {@link HEIGHT_UNIFORM_FLOATS} floats. Defaults to a new array.
 * @returns `out`, fully overwritten.
 * @throws {Error} If the source has no levels or more than {@link MAX_HEIGHT_LEVELS}.
 * @example
 * device.queue.writeBuffer(buffer, 0, packHeightUniform(source));
 */
export function packHeightUniform(
    source: HeightSource | null,
    out: Float32Array = new Float32Array(HEIGHT_UNIFORM_FLOATS),
): Float32Array {
    out.fill(0);
    if (!source) return out;
    const { levels } = source;
    if (levels.length === 0 || levels.length > MAX_HEIGHT_LEVELS) {
        throw new Error(`A height source needs 1 to ${MAX_HEIGHT_LEVELS} levels, got ${levels.length}.`);
    }
    out[0] = levels.length;
    out[1] = 1;
    levels.forEach((level, i) => {
        const offset = HEADER_FLOATS + i * LEVEL_FLOATS;
        out[offset] = level.originX;
        out[offset + 1] = level.originY;
        out[offset + 2] = level.cellSizeX;
        out[offset + 3] = level.cellSizeY;
        out[offset + 4] = level.width;
        out[offset + 5] = level.height;
    });
    return out;
}

/** Fraction of a window's width over which it blends into the next coarser level; equals `HEIGHT_BLEND_BAND` in the shader. */
export const HEIGHT_BLEND_BAND = 0.125;

/**
 * Height of a source at a local-space point, as the shader computes it.
 *
 * Takes the finest level whose window contains the point and blends it toward
 * the next coarser level across the outer {@link HEIGHT_BLEND_BAND} of the
 * window (smoothstep), so levels meet without a step. When no window contains
 * the point it takes the coarsest level, clamped to its edge. Each level is
 * interpolated bilinearly between the four nearest samples. Like the shader,
 * it clamps the sample position to `size - 2`, so the last row and column are
 * never reached (kept from the original heightfield lookup so terrain looks
 * the same). This is the CPU twin of `terrainHeight` in
 * `shaders/height-lookup.wgsl`; keep the two in step.
 *
 * @param source - Height source to read.
 * @param x - Local-space X.
 * @param y - Local-space Y.
 * @returns The interpolated height.
 * @throws Never throws.
 * @example
 * const z = heightAt(source, 120.5, 98.25);
 */
export function heightAt(source: HeightSource, x: number, y: number): number {
    const { levels } = source;
    const last = levels.length - 1;
    for (let i = 0; i < last; i++) {
        const weight = levelWeight(levels[i]!, x, y);
        if (weight > 0) {
            const fine = sampleLevel(levels[i]!, x, y);
            return weight >= 1 ? fine : sampleLevel(levels[i + 1]!, x, y) * (1 - weight) + fine * weight;
        }
    }
    return sampleLevel(levels[last]!, x, y);
}

/** 0 on and outside the window's edge, rising by smoothstep to 1 at the blend band inside it. */
function levelWeight(level: HeightLevel, x: number, y: number): number {
    const u = (x - level.originX) / level.cellSizeX;
    const v = (y - level.originY) / level.cellSizeY;
    const distance = Math.min(u, v, level.width - 1 - u, level.height - 1 - v);
    const band = Math.max(Math.max(level.width, level.height) * HEIGHT_BLEND_BAND, 1);
    const t = clamp(distance / band, 0, 1);
    return t * t * (3 - 2 * t);
}

function sampleLevel(level: HeightLevel, x: number, y: number): number {
    const u = clamp((x - level.originX) / level.cellSizeX, 0, level.width - 2);
    const v = clamp((y - level.originY) / level.cellSizeY, 0, level.height - 2);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const at = (di: number, dj: number) => level.data[(j + dj) * level.width + (i + di)]!;
    return bilerp(at(0, 0), at(1, 0), at(0, 1), at(1, 1), fu, fv);
}

/**
 * Smallest sample spacing of any level whose window overlaps a rectangle.
 *
 * Tells how fine the data is anywhere under a patch, not only at its centre, so a
 * patch that touches a fine window is not left coarser than that data.
 *
 * @param source - Height source to read.
 * @param minX - West edge of the rectangle.
 * @param minY - South edge.
 * @param maxX - East edge.
 * @param maxY - North edge.
 * @returns The finest cell size over the rectangle; the coarsest level's when no window overlaps it.
 * @throws Never throws.
 * @example
 * const cell = finestCellOver(source, block.x, block.y, block.x + block.size, block.y + block.size);
 */
export function finestCellOver(source: HeightSource, minX: number, minY: number, maxX: number, maxY: number): number {
    const { levels } = source;
    for (let i = 0; i < levels.length - 1; i++) {
        const level = levels[i]!;
        const west = level.originX;
        const south = level.originY;
        const east = level.originX + (level.width - 1) * level.cellSizeX;
        const north = level.originY + (level.height - 1) * level.cellSizeY;
        if (minX <= east && maxX >= west && minY <= north && maxY >= south) {
            return Math.min(level.cellSizeX, level.cellSizeY);
        }
    }
    const last = levels[levels.length - 1]!;
    return Math.min(last.cellSizeX, last.cellSizeY);
}
