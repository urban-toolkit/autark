import type {
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from 'autk-core';

import { ColorMapInterpolator } from './color-types';

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
    LayerType,
    BoundingBox,
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

