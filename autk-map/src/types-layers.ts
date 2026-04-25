/**
 * @module AutkMapLayerTypes
 * Shared layer metadata and render payload types for `autk-map`.
 *
 * This module groups the data shapes passed between layer loaders, render
 * controllers, and GPU-backed layer implementations. It describes the static
 * layer identity used to order the stack, the mutable render and colormap
 * state, and the render-ready geometry, border, raster, and thematic payloads
 * consumed by the different layer pipelines.
 */

import type {
    ColorMapConfig,
    ResolvedDomain,
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from './types-core';

/** Static metadata used to identify and order a layer in the map stack. */
export interface LayerInfo {
    /** Stable layer identifier used for lookup and updates. */
    id: string;
    /** Rendering order relative to other layers. */
    zIndex: number;
    /** Semantic layer type and geometry family handled by the layer. */
    typeLayer: LayerType;
}

/** Runtime colormap state associated with a layer. */
export interface LayerColormap {
    /** User colormap configuration used for thematic styling. */
    config: ColorMapConfig;
    /** Domain resolved from the current thematic or raster data, if available. */
    computedDomain?: ResolvedDomain;
    /** Legend labels derived from the resolved domain, if available. */
    computedLabels?: string[];
}

/** Mutable render state associated with a layer. */
export interface LayerRenderInfo {
    /** Layer opacity in the range `[0, 1]`. */
    opacity: number;
    /** Enables thematic color interpolation when `true`. */
    isColorMap?: boolean;
    /** Skips rendering work for this layer when `true`. */
    isSkip?: boolean;
    /** Enables picking for this layer when `true`. */
    isPick?: boolean;
    /** Current colormap configuration and derived runtime domain or label state. */
    colormap: LayerColormap;
    /** Pending canvas-relative pick coordinates `[x, y]` in CSS pixels, if any. */
    pickedComps?: number[];
}

/** Render-ready layer payload produced by loaders and triangulation steps. */
export interface LayerData {
    /** Geometry buffers for the layer primitives. */
    geometry: LayerGeometry[];
    /** Per-primitive component metadata aligned with `geometry`. */
    components: LayerComponent[];
    /** Optional border geometry for outlined 2D triangle layers. */
    border?: LayerBorder[];
    /** Cumulative border-component metadata aligned with `border`. */
    borderComponents?: LayerBorderComponent[];
    /** Raster grid width in cells, for raster layers only. */
    rasterResX?: number;
    /** Raster grid height in cells, for raster layers only. */
    rasterResY?: number;
    /** Raster scalar values, for raster layers only. */
    raster?: Float32Array;
    /** Per-component or per-cell thematic values used for color mapping. */
    thematic?: LayerThematic[];
}

/** Numeric thematic payload associated with a layer. */
export interface LayerThematic {
    /** Scalar value aligned with one rendered component or raster cell. */
    value: number;
    /** Numeric validity flag propagated with the thematic value. */
    valid: number;
}
