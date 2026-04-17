import { FeatureCollection } from 'geojson';
import { ColorRGB, LayerType } from 'autk-core';

// ── Render pipeline ───────────────────────────────────────────────────────────

/** A single geometry layer rendered from each viewpoint. */
export interface RenderLayer {
    /** GeoJSON source features for this layer. */
    geojson: FeatureCollection;
    /**
     * Layer colour. `r`, `g`, `b` are in [0–255]; `alpha` is in [0–1].
     * Use `ColorMap.getColor()` or a literal `{ r, g, b, alpha }` to build this.
     */
    color: ColorRGB;
    /** Triangulation strategy — determines how the GeoJSON geometry is meshed. */
    type: LayerType;
}

/** Parameters for {@link ComputeRender.run}. */
export interface RenderPipelineParams {
    /** Geometry layers rendered from each viewpoint. */
    layers: RenderLayer[];
    /**
     * Source FeatureCollection used to generate street-level viewpoints.
     * `LineString` / `MultiLineString` features are sampled every `samplingInterval` metres.
     * `Point` features are used as-is (looking north).
     */
    source: FeatureCollection;
    /** Sampling interval in metres along linear features (default: 10). */
    samplingInterval?: number;
    /** Camera eye height above ground in scene units (default: 1.7). */
    eyeHeight?: number;
    /** Horizontal field of view in degrees (default: 90). */
    fov?: number;
    /** Near clipping plane distance (default: 1). */
    near?: number;
    /** Far clipping plane distance (default: 5000). */
    far?: number;
    /** Tile resolution in pixels — must be a multiple of 8 (default: 64). */
    tileSize?: number;
    /** Background sky colour as [R, G, B, A] in [0–1] (default: opaque black). */
    clearColor?: [number, number, number, number];
}

// ── GPGPU pipeline ────────────────────────────────────────────────────────────

/** Parameters for {@link ComputeGpgpu.run}. */
export interface GpgpuPipelineParams {
    /** GeoJSON FeatureCollection to process — one GPU invocation per feature. */
    collection: FeatureCollection;
    /**
     * Maps WGSL variable names to feature property dot-paths.
     * e.g. `{ height: 'properties.height' }` or `{ height: 'height' }` (shorthand).
     */
    variableMapping: Record<string, string>;
    /** Per-feature fixed-length arrays: variable name → element count. */
    attributeArrays?: Record<string, number>;
    /**
     * Per-feature matrices: variable name → `{ rows, cols }`.
     * Use `rows: 'auto'` to infer the row count per feature at runtime.
     */
    attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;
    /**
     * Global scalar constants shared across all features (uploaded once to the GPU).
     * Suitable for values like sun angles, thresholds, or day-of-year.
     */
    uniforms?: Record<string, number>;
    /** Global array constants shared across all features. */
    uniformArrays?: Record<string, number[]>;
    /** Global matrix constants shared across all features. */
    uniformMatrices?: Record<string, { data: number[][]; cols: number }>;
    /** Single output column written to `feature.properties.compute[resultField]`. */
    resultField?: string;
    /** Multiple output columns written to `feature.properties.compute`. Takes priority over `resultField`. */
    outputColumns?: string[];
    /**
     * WGSL function body. All mapped variables arrive as typed parameters.
     * Must return `f32` for a single output, or `OutputArray` for multiple outputs.
     */
    wgslBody: string;
}
