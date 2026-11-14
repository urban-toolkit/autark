/**
 * @module heightfield
 * Heightfield conversion helpers for raster-backed elevation data.
 *
 * This module converts Autark raster `FeatureCollection` payloads into a
 * compact local-space heightfield used by terrain rendering and other elevation
 * workflows. The source collection must provide a `bbox`, `rasterResX`,
 * `rasterResY`, and a numeric raster band selected by property path.
 */

import type { FeatureCollection, Geometry } from 'geojson';
import { valueAtPath } from './utils-data';

/**
 * Local-space grid of scalar height samples.
 *
 * The grid is stored row-major in `data` and aligned to `bounds`, whose
 * coordinates are already shifted by the supplied map origin.
 */
export interface Heightfield {
    /** Number of grid samples along the X axis. */
    width: number;
    /** Number of grid samples along the Y axis. */
    height: number;
    /** Local-space X coordinate of the first grid sample. */
    originX: number;
    /** Local-space Y coordinate of the first grid sample. */
    originY: number;
    /** Local-space distance between adjacent samples along X. */
    cellSizeX: number;
    /** Local-space distance between adjacent samples along Y. */
    cellSizeY: number;
    /** Smallest finite height value found in the source data. */
    minHeight: number;
    /** Largest finite height value found in the source data. */
    maxHeight: number;
    /** Row-major heights. Missing values default to zero, or remain NaN for validation when requested. */
    data: Float32Array;
    /** Local-space bounds as `[minX, minY, maxX, maxY]`. */
    bounds: [number, number, number, number];
}

/**
 * Builds a local-space heightfield from a raster feature collection.
 *
 * The raster band is read from the first feature properties using `property`,
 * and the returned bounds subtract `origin` from the source bbox.
 *
 * @param collection Raster feature collection containing `bbox` and raster metadata.
 * @param property Dot-path to the raster band values in the first feature properties.
 * @param origin World-space origin to subtract from the raster bbox.
 * @param preserveNoData Preserve missing samples as NaN until terrain validation can repair them.
 * @returns Heightfield with local bounds, cell sizes, min/max height, and sample data.
 * @throws {Error} If bbox, raster metadata, raster values, or finite heights are missing or invalid.
 * @example
 * const heightfield = heightfieldFromRaster(collection, 'bands.elevation', origin);
 * console.log(heightfield.width, heightfield.bounds);
 */
export function heightfieldFromRaster(
    collection: FeatureCollection<Geometry | null>,
    property: string,
    origin: readonly number[],
    preserveNoData = false,
): Heightfield {
    const feature = collection.features[0];
    const props = feature?.properties as Record<string, unknown> | undefined;

    const rasterValues = props ? valueAtPath(props, property) : undefined;

    if (!props || !isArrayLike(rasterValues) || !collection.bbox) {
        throw new Error(`Heightfield requires a raster FeatureCollection with bbox and '${property}' band values.`);
    }

    const width = Number(props.rasterResX);
    const height = Number(props.rasterResY);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
        throw new Error('Heightfield raster resolution must be at least 2x2.');
    }

    const values = Array.from(rasterValues, Number);
    if (values.length !== width * height) {
        throw new Error(`Heightfield has ${values.length} cells; expected ${width * height}.`);
    }

    const data = new Float32Array(values);
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let nonFinite = 0;
    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (Number.isFinite(value)) {
            minHeight = Math.min(minHeight, value);
            maxHeight = Math.max(maxHeight, value);
        } else {
            data[i] = preserveNoData ? NaN : 0;
            nonFinite++;
        }
    }

    if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
        throw new Error('Heightfield does not contain finite elevation values.');
    }
    if (nonFinite > 0 && !preserveNoData) {
        console.warn(`Heightfield contains ${nonFinite} non-finite elevation values. These were set to 0.`);
    }

    const bounds: [number, number, number, number] = [
        Number(collection.bbox[0]) - origin[0],
        Number(collection.bbox[1]) - origin[1],
        Number(collection.bbox[2]) - origin[0],
        Number(collection.bbox[3]) - origin[1],
    ];

    return {
        width,
        height,
        originX: bounds[0],
        originY: bounds[1],
        cellSizeX: (bounds[2] - bounds[0]) / Math.max(1, width - 1),
        cellSizeY: (bounds[3] - bounds[1]) / Math.max(1, height - 1),
        minHeight,
        maxHeight,
        data,
        bounds,
    };
}

/**
 * Checks whether a value can be copied with `Array.from` as raster samples.
 *
 * @param value Candidate raster band payload.
 * @returns `true` when the value is an array or typed-array view.
 * @throws Never throws.
 * @example
 * isArrayLike(new Float32Array([1, 2])); // true
 */
function isArrayLike(value: unknown): value is ArrayLike<unknown> {
    return Array.isArray(value) || ArrayBuffer.isView(value);
}
