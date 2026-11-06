/**
 * @module AutkMapRasterRgb
 * Helpers that turn band arrays from a GeoTIFF-derived feature collection into
 * the pixel payload of a raster layer.
 *
 * A single band is normally drawn through a color map. Satellite and aerial
 * imagery instead carries red, green and blue bands that should be shown as
 * they are, so {@link composeRgbRaster} interleaves three bands into the RGBA
 * texture layout the raster layer already accepts.
 */

/** Three band accessors, in red, green, blue order, such as `['band_1', 'band_2', 'band_3']`. */
export type RasterRgbBands = [red: string, green: string, blue: string];

/** Inclusive `[min, max]` band values that map to 0 and 255 in the displayed image. */
export type RasterRgbRange = [min: number, max: number];

/**
 * Tells whether a raster `property` names three bands to draw as RGB.
 *
 * @param property - Raster property accessor passed to the map.
 * @returns `true` for an array of three band path strings.
 */
export function isRgbBands(property: unknown): property is RasterRgbBands {
    return Array.isArray(property)
        && property.length === 3
        && property.every((band) => typeof band === 'string');
}

/**
 * Converts a resolved band payload into a flat `Float32Array`.
 *
 * Typed arrays and plain arrays are accepted. Non-finite samples become `NaN`.
 *
 * @param resolved - Value read from the feature properties.
 * @returns The band values, or `null` when the payload is not an array-like of numbers.
 */
export function toFloat32Band(resolved: unknown): Float32Array | null {
    if (resolved instanceof Float32Array) return resolved;

    const toNumber = (value: unknown): number => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Number.NaN;
    };

    if (ArrayBuffer.isView(resolved) && !(resolved instanceof DataView)) {
        return new Float32Array(Array.from(resolved as unknown as ArrayLike<number>, toNumber));
    }
    if (Array.isArray(resolved)) return new Float32Array(resolved.map(toNumber));
    return null;
}

/**
 * Picks the value range that maps to the full display range.
 *
 * Imagery already stored as 8-bit values (everything within 0 to 255) keeps its
 * values as they are. Anything else, for example reflectance up to 10000, is
 * stretched from its smallest to its largest finite value across the three bands.
 *
 * @param bands - The three band arrays.
 * @returns The `[min, max]` range, or `[0, 255]` when no finite value exists.
 */
export function resolveRgbRange(bands: readonly Float32Array[]): RasterRgbRange {
    let min = Infinity;
    let max = -Infinity;
    for (const band of bands) {
        for (let i = 0; i < band.length; i++) {
            const value = band[i];
            if (value < min) min = value;
            if (value > max) max = value;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 255];
    return min >= 0 && max <= 255 ? [0, 255] : [min, max];
}

/**
 * Interleaves three bands into an RGBA raster payload.
 *
 * Each channel is scaled linearly from `range` to 0 to 255 and clamped. The
 * alpha channel is 255, except where any band has no data (`NaN`), which stays
 * fully transparent so no-data margins do not draw as black.
 *
 * @param bands - Red, green and blue band arrays of equal length.
 * @param range - Band values that map to 0 and 255. Defaults to {@link resolveRgbRange}.
 * @returns A `Float32Array` of `length * 4` values with channels in 0 to 255.
 * @throws If the bands differ in length.
 * @example
 * const rgba = composeRgbRaster([r, g, b], [0, 3000]);
 */
export function composeRgbRaster(
    bands: readonly [Float32Array, Float32Array, Float32Array],
    range?: RasterRgbRange,
): Float32Array {
    const [red, green, blue] = bands;
    if (red.length !== green.length || red.length !== blue.length) {
        throw new Error(
            `RGB raster bands must have the same length (got ${red.length}, ${green.length}, ${blue.length}).`,
        );
    }

    const [min, max] = range ?? resolveRgbRange(bands);
    const span = max - min;
    const scale = span > 0 ? 255 / span : 0;
    const channel = (value: number) => Math.min(255, Math.max(0, (value - min) * scale));

    const rgba = new Float32Array(red.length * 4);
    for (let i = 0; i < red.length; i++) {
        const offset = i * 4;
        if (Number.isNaN(red[i]) || Number.isNaN(green[i]) || Number.isNaN(blue[i])) continue;
        rgba[offset] = channel(red[i]);
        rgba[offset + 1] = channel(green[i]);
        rgba[offset + 2] = channel(blue[i]);
        rgba[offset + 3] = 255;
    }
    return rgba;
}
