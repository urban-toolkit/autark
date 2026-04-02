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
 * Parameters for updating a layer's thematic (color-mapped) values with explicit domain.
 */
export interface UpdateThematicParamsWithDomain {
    /** Target layer identifier. */
    id: string;
    /** Source feature collection used to derive thematic values. */
    collection: FeatureCollection;
    /** Extracts a value from each item in the collection. */
    getFnv: (item: unknown) => number | string;
    /**
     * Explicit color-scale domain for direct normalization.
     *
     * - `SequentialDomain` — `[min, max]` for sequential scales.
     * - `DivergingDomain`  — `[min, center, max]` for diverging scales.
     * - `CategoricalDomain` — ordered list of category strings.
     */
    domain: SequentialDomain | DivergingDomain | CategoricalDomain;
    /** Must not be specified when using explicit domain. */
    normalization?: never;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values with automatic domain computation.
 */
export interface UpdateThematicParamsWithNormalization {
    /** Target layer identifier. */
    id: string;
    /** Source feature collection used to derive thematic values. */
    collection: FeatureCollection;
    /** Extracts a value from each item in the collection. */
    getFnv: (item: unknown) => number | string;
    /** Must not be specified when using normalization. */
    domain?: never;
    /**
     * Normalization configuration for automatic domain computation.
     * Domain limits will be computed based on this normalization mode.
     */
    normalization: NormalizationConfig;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values with default normalization.
 * 
 * When neither `domain` nor `normalization` is specified, the domain will be
 * automatically computed from the min and max values of the data collection.
 */
export interface UpdateThematicParamsWithDefault {
    /** Target layer identifier. */
    id: string;
    /** Source feature collection used to derive thematic values. */
    collection: FeatureCollection;
    /** Extracts a value from each item in the collection. */
    getFnv: (item: unknown) => number | string;
    /** Must not be specified when using default normalization. */
    domain?: never;
    /** Must not be specified when using default normalization. */
    normalization?: never;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 *
 * Choose one of three approaches:
 * - **Explicit domain**: Set `domain` to `[min, max]` (or diverging/categorical).
 *   The provided values will be used directly for color normalization.
 * - **Automatic from normalization**: Set `normalization` with a mode (e.g., PERCENTILE).
 *   Domain limits will be computed based on the normalization configuration.
 * - **Default (min/max)**: Omit both `domain` and `normalization`.
 *   Domain will be automatically computed as `[min, max]` from the data values.
 */
export type UpdateThematicParams = UpdateThematicParamsWithDomain | UpdateThematicParamsWithNormalization | UpdateThematicParamsWithDefault;
