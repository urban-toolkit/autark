/**
 * @module dem-decode
 * Decoding of elevation tiles that store heights in the colors of a PNG.
 *
 * Two encodings are common:
 *
 * | Encoding | Height in metres |
 * |---|---|
 * | `terrarium` | `R * 256 + G + B / 256 - 32768` |
 * | `mapbox` (terrain-RGB) | `-10000 + (R * 65536 + G * 256 + B) * 0.1` |
 *
 * The pixels must be read exactly as stored: no color-space conversion and no
 * premultiplied alpha, or the heights are silently corrupted (see
 * {@link DEM_BITMAP_OPTIONS}).
 */

/** How heights are packed into a tile's colors. */
export type DemEncoding = 'terrarium' | 'mapbox';

/** Encodings this module can decode. */
export const DEM_ENCODINGS: readonly DemEncoding[] = ['terrarium', 'mapbox'] as const;

/**
 * Options for `createImageBitmap` that keep the stored pixel values: the browser
 * must neither convert the color space nor premultiply alpha.
 */
export const DEM_BITMAP_OPTIONS: ImageBitmapOptions = {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
};

/** One decoded elevation tile. */
export interface DemTile {
    /** Pixels along each edge. */
    readonly size: number;
    /** Heights in metres, row-major from the north-west corner, `size * size` long; `NaN` where there is no data. */
    readonly heights: Float32Array;
    /** Lowest finite height, or 0 when the tile has none. */
    readonly min: number;
    /** Highest finite height, or 0 when the tile has none. */
    readonly max: number;
}

/**
 * Tells whether a value names a supported elevation encoding.
 *
 * @param value - Value to test.
 * @returns `true` for `'terrarium'` and `'mapbox'`.
 */
export function isDemEncoding(value: unknown): value is DemEncoding {
    return typeof value === 'string' && (DEM_ENCODINGS as readonly string[]).includes(value);
}

/**
 * Height of one pixel.
 *
 * @param r - Red, 0 to 255.
 * @param g - Green, 0 to 255.
 * @param b - Blue, 0 to 255.
 * @param encoding - How the height is packed.
 * @returns The height in metres.
 * @example
 * decodeHeight(128, 0, 0, 'terrarium'); // 0
 */
export function decodeHeight(r: number, g: number, b: number, encoding: DemEncoding): number {
    return encoding === 'terrarium'
        ? r * 256 + g + b / 256 - 32768
        : -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

/**
 * Decodes the RGBA bytes of a tile image.
 *
 * A fully transparent pixel is "no data" and becomes `NaN`.
 *
 * @param rgba - Bytes in RGBA order, `size * size * 4` long.
 * @param size - Pixels along each edge.
 * @param encoding - How heights are packed.
 * @returns The tile.
 * @throws {Error} If `rgba` is not `size * size * 4` bytes.
 * @example
 * const tile = decodeDemPixels(imageData.data, 256, 'terrarium');
 */
export function decodeDemPixels(rgba: ArrayLike<number>, size: number, encoding: DemEncoding): DemTile {
    if (!Number.isInteger(size) || size <= 0 || rgba.length !== size * size * 4) {
        throw new Error(`Elevation tile needs ${size} x ${size} RGBA pixels, got ${rgba.length} bytes.`);
    }
    const heights = new Float32Array(size * size);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heights.length; i++) {
        const o = i * 4;
        if (rgba[o + 3] === 0) {
            heights[i] = NaN;
            continue;
        }
        const h = decodeHeight(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, encoding);
        heights[i] = h;
        if (h < min) min = h;
        if (h > max) max = h;
    }
    if (min > max) {
        min = 0;
        max = 0;
    }
    return { size, heights, min, max };
}
