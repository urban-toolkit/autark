import type {
    ColorMapConfig,
    ResolvedDomain,
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from './core-types';

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
    /** Indices of currently picked components, if any. */
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

