import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import type {
    ColorMapConfig,
    TransferFunction,
    LayerType,
} from './types-core';

/**
 * Parameters for loading a feature collection as a map layer.
 *
 * Pass `type: 'raster'` together with `property` to load a GeoTIFF-derived
 * raster layer. For all other layer types `property` is unused.
 */
export interface LoadCollectionParams {
    /** Source feature collection. Raster collections may contain null geometries. */
    collection: FeatureCollection<Geometry | null>;
    /** Optional explicit layer type override. Required for mixed-geometry collections. */
    type?: LayerType | null;
    /**
     * Optional accessor used for immediate thematic mapping.
     *
     * Dot-path string accessor (e.g. `properties.shape_area`).
     *
     * For raster layers, the path is resolved from each raster cell object.
     */
    property?: string;
}

/**
 * Parameters for updating a raster layer's values.
 *
 * `property` is resolved for each raw raster cell payload from
 * `collection.features[0].properties.raster`.
 */
export interface UpdateRasterParams {
    /** GeoTIFF-derived feature collection. */
    collection: FeatureCollection<Geometry | null>;
    /** Dot-path accessor for numeric value in each raster cell. */
    property: string;
    /** Optional transfer function controlling opacity mapping for raster values. */
    transferFunction?: TransferFunction;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 */
export interface UpdateThematicParams {
    /** Source feature collection used to derive thematic values. Prefer the original loaded feature ids/order. */
    collection: FeatureCollection;
    /** Dot-path accessor resolved from each item in the collection. */
    property: string;
}

/**
 * Parameters for patching a layer's color-map configuration.
 */
export interface UpdateColorMapParams {
    /** Partial color-map patch merged with existing layer color-map state. */
    colorMap: Partial<ColorMapConfig>;
}
