import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import type {
    SequentialDomain,
    DivergingDomain,
    CategoricalDomain,
    TransferFunction,
    NormalizationConfig,
} from 'autk-core';

import type { LayerType } from './layer-types';

/**
 * Parameters for loading a feature collection as a map layer.
 *
 * Pass `type: 'raster'` together with `getFnv` to load a GeoTIFF-derived
 * raster layer. For all other layer types `getFnv` is unused.
 */
export interface LoadCollectionParams {
    /** Destination layer identifier. */
    id: string;
    /** Source feature collection. Raster collections may contain null geometries. */
    collection: FeatureCollection<Geometry | null>;
    /** Optional explicit geometry type override. */
    type?: LayerType | null;
    /** Extracts a value from each item. For raster layers, must return a number. For vector layers, may return a number or string (categorical). */
    getFnv?: (item: unknown) => number | string;
}

/**
 * Parameters for updating a raster layer's values.
 *
 * `getFnv` receives each raw raster cell payload from `collection.features[0].properties.raster`
 * and must return a number.
 */
export interface UpdateRasterParams {
    /** Target layer identifier. */
    id: string;
    /** GeoTIFF-derived feature collection. */
    collection: FeatureCollection<Geometry | null>;
    /** Extracts a numeric value from each raster cell. */
    getFnv: (cell: unknown) => number;
    /** Explicit color-scale domain. If omitted, computed from the data. */
    domain?: SequentialDomain | DivergingDomain;
    /** Optional transfer function controlling opacity mapping for raster values. */
    transferFunction?: TransferFunction;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 *
 * For vector layers `getFnv` receives a GeoJSON `Feature`.
 * In both cases the function must return a `number` (or a `string` for
 * categorical vector data).
 */
export interface UpdateThematicParams {
    /** Target layer identifier. */
    id: string;
    /** Source feature collection used to derive thematic values. */
    collection: FeatureCollection;
    /** Extracts a value from each item in the collection. */
    getFnv: (item: unknown) => number | string;
    /**
     * Explicit color-scale domain.
     *
     * - `SequentialDomain` — `[min, max]` for sequential scales.
     * - `DivergingDomain`  — `[min, center, max]` for diverging scales.
     * - `CategoricalDomain` — ordered list of category strings.
     *
     * When omitted, the domain is computed from values using `normalization` mode.
     */
    domain?: SequentialDomain | DivergingDomain | CategoricalDomain;
    /** Normalization configuration for automatic domain computation. */
    normalization?: NormalizationConfig;
}
