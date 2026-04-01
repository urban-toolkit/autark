import {
    FeatureCollection,
    Geometry
} from 'geojson';

import type {
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry,
    SequentialDomain,
    DivergingDomain,
    CategoricalDomain,
} from 'autk-core';

import {
    ColorMapInterpolator,
    LayerType,
} from './constants';

/**
 * Shared type exports re-exposed from `autk-core` for map layer configuration.
 */
export type {
    LayerGeometry,
    LayerComponent,
    LayerBorder,
    LayerBorderComponent,
    CameraData,
    SequentialDomain,
    DivergingDomain,
    CategoricalDomain,
} from 'autk-core';

/**
 * Minimal metadata used to identify and order a layer in the map stack.
 */
export interface LayerInfo {
    /** Stable layer identifier. */
    id: string;
    /** Rendering order relative to other layers. */
    zIndex: number;
    /** Geometry kind handled by the layer. */
    typeLayer: LayerType;
}

/**
 * Runtime rendering state associated with a layer.
 */
export interface LayerRenderInfo {
    /** Layer opacity in the range `[0, 1]`. */
    opacity: number;
    /** Enables thematic color interpolation when `true`. */
    isColorMap?: boolean;
    /** Interpolator used to convert thematic values into colors. */
    colorMapInterpolator: ColorMapInterpolator;
    /** Labels displayed for the current color map legend. */
    colorMapLabels: string[];
    /** Indices of currently picked components, if any. */
    pickedComps?: number[];
    /** Skips rendering work for this layer when `true`. */
    isSkip?: boolean;
    /** Enables picking for this layer when `true`. */
    isPick?: boolean;
}

/**
 * Render-ready layer payload produced by loaders and triangulation steps.
 */
export interface LayerData {
    /** Geometry buffers for the layer primitives. */
    geometry: LayerGeometry[];
    /** Per-primitive component metadata. */
    components: LayerComponent[];
    /** Optional border geometry for outlined rendering. */
    border?: LayerBorder[];
    /** Metadata associated with border primitives. */
    borderComponents?: LayerBorderComponent[];
    /** Raster grid width in cells (for raster layers only). */
    rasterResX?: number;
    /** Raster grid height in cells (for raster layers only). */
    rasterResY?: number;
    /** Raster values (for raster layers only). */
    raster?: number[];
    /** Thematic values used for color mapping. */
    thematic?: LayerThematic[];
    /** Highlighted component indices. */
    highlighted?: number[];
}

/**
 * Numeric thematic payload associated with a layer.
 */
export interface LayerThematic {
    /** Values aligned with layer components or raster cells. */
    values: number[];
}



/**
 * Parameters for updating a layer's thematic (color-mapped) values.
++ 
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
    /** Extracts a numeric raster value from each cell. Required when `type === 'raster'`. */
    getFnv?: (cell: unknown) => number;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 *
 * For vector layers `getFnv` receives a GeoJSON `Feature`.
 * For raster layers `getFnv` receives each raw raster cell payload.
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
     * If omitted, computed automatically from the data.
     * Not applicable to raster layers.
     */
    domain?: SequentialDomain | DivergingDomain | CategoricalDomain;
}