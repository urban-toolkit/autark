/**
 * @module AutkMapApi
 * Parameter interfaces for loading and updating map layers.
 *
 * This module defines the public request shapes used by `AutkMap` layer APIs.
 * The interfaces describe how GeoJSON collections, prebuilt mesh data, raster
 * payloads, thematic mappings, color-map patches, and render-state updates are
 * passed into the map so layer creation and incremental updates can be applied
 * consistently.
 */

import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import type {
    ColorMapConfig,
    TransferFunction,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from './types-core';

import type { 
    LayerRenderInfo, 
    LayerThematic 
} from './types-layers';

/**
 * Parameters for loading a feature collection as a map layer.
 *
 * When `type` is omitted, the map may infer a vector layer type from the
 * collection's non-null geometries. Mixed-geometry collections require an
 * explicit `type`. Pass `type: 'raster'` together with `property` to load a
 * GeoTIFF-derived raster layer.
 *
 * For vector layers, `property` is optional and is used to initialize thematic
 * mapping immediately after the layer is created. For raster layers, `property`
 * is required so a numeric value can be extracted from each raster cell.
 */
export interface LoadCollectionParams {
    /**
     * Source feature collection to load.
     *
     * Raster-derived collections may contain `null` geometries because values
     * are resolved from raster cell payloads rather than vector geometry.
     */
    collection: FeatureCollection<Geometry | null>;
    /**
     * Optional explicit layer type override.
     *
     * Provide this when geometry-based inference is ambiguous, such as for
     * mixed-geometry collections, or when the intended semantic layer type
     * should not be derived automatically.
     */
    type?: LayerType | null;
    /**
     * Property accessor used to derive layer values.
     *
     * Use a dot-path string accessor such as `properties.shape_area`.
     *
     * For vector layers, the path is resolved from each feature and is applied
     * immediately as the initial thematic mapping when provided.
     *
     * For raster layers, the path is resolved from each raster cell object and
     * is required to populate the raster value texture.
     */
    property?: string;
}

/**
 * Parameters for loading a prebuilt triangle mesh directly.
 *
 * Mesh inputs bypass GeoJSON triangulation and are added as already-prepared
 * geometry. The geometry, components, and optional thematic values are expected
 * to remain aligned by index so rendering, picking, and color mapping refer to
 * the same logical mesh parts.
 */
export interface LoadMeshParams {
    /**
     * Mesh geometry in map-local coordinates.
     *
     * Coordinates must already be expressed relative to the map's current
     * shared origin.
     */
    geometry: LayerGeometry[];
    /**
     * Per-component metadata aligned with `geometry`.
     *
     * Component ordering is used for picking and for associating thematic data
     * with rendered mesh parts.
     */
    components: LayerComponent[];
    /**
     * Optional thematic values aligned one-to-one with `components`.
     *
     * When provided, each thematic entry should correspond to the component at
     * the same index.
     */
    thematic?: LayerThematic[];
    /**
     * Mesh render type.
     *
     * Currently only `'buildings'` is supported by the map mesh-loading API.
     */
    type?: 'buildings';
}

/**
 * Parameters for updating a raster layer's values.
 *
 * Raster updates replace the value source for an existing raster layer. The
 * `property` accessor is resolved for each raw raster cell payload from
 * `collection.features[0].properties.raster`.
 */
export interface UpdateRasterParams {
    /**
     * GeoTIFF-derived feature collection containing raster payload data.
     */
    collection: FeatureCollection<Geometry | null>;
    /**
     * Dot-path accessor for the numeric value in each raster cell.
     */
    property: string;
    /**
     * Optional transfer function used to derive raster opacity from values.
     */
    transferFunction?: TransferFunction;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 *
 * The supplied collection is used to recompute thematic values for an existing
 * layer. Correct alignment depends on how the target layer matches source data,
 * so callers should preserve stable feature ordering or identifiers when
 * preparing update collections.
 */
export interface UpdateThematicParams {
    /**
     * Source feature collection used to derive thematic values.
     *
     * Prefer the original loaded feature collection, or one with stable
     * matching `feature.id` values, so thematic values align correctly to the
     * rendered components.
     */
    collection: FeatureCollection;
    /**
     * Dot-path accessor resolved from each item in the collection.
     */
    property: string;
}

/**
 * Parameters for patching a layer's color-map configuration.
 *
 * The provided object is treated as a partial patch and merged into the layer's
 * existing color-map state rather than replacing the full configuration.
 */
export interface UpdateColorMapParams {
    /**
     * Partial color-map patch merged with the existing layer color-map state.
     */
    colorMap: Partial<ColorMapConfig>;
}

/**
 * Parameters for updating one or more render properties of a layer.
 *
 * Use this to patch render-state fields such as visibility, opacity, picking,
 * or other supported layer render flags without rebuilding the layer.
 */
export interface UpdateRenderInfoParams {
    /**
     * Partial render-state patch applied to the target layer.
     */
    renderInfo: Partial<LayerRenderInfo>;
}
