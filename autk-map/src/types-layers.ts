import type {
    ColorMapConfig,
    ResolvedDomain,
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from './types-core';

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
export interface LayerColormap {
    /** User colormap configuration (interpolator + domain mode). */
    config: ColorMapConfig;
    /** Domain computed from loaded thematic/raster data. */
    computedDomain?: ResolvedDomain;
    /** Labels computed from the current computed domain. */
    computedLabels?: string[];
}

/**
 * Runtime rendering state associated with a layer.
 */
export interface LayerRenderInfo {
    /** Layer opacity in the range `[0, 1]`. */
    opacity: number;
    /** Enables thematic color interpolation when `true`. */
    isColorMap?: boolean;
    /** Skips rendering work for this layer when `true`. */
    isSkip?: boolean;
    /** Enables picking for this layer when `true`. */
    isPick?: boolean;
    /** Colormap configuration and computed runtime domain/labels. */
    colormap: LayerColormap;
    /** Pending pick coordinates in CSS pixels, if any. */
    pickedComps?: number[];
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
    raster?: Float32Array;
    /** Thematic values used for color mapping. */
    thematic?: LayerThematic[];
}

/**
 * Numeric thematic payload associated with a layer.
 */
export interface LayerThematic {
    /** Scalar value aligned with one rendered layer component or raster cell. */
    value: number;
    /** Whether the thematic value is valid for color mapping. */
    valid: number;
}
