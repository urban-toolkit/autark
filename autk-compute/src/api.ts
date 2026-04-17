import { FeatureCollection } from 'geojson';

import { LayerType } from 'autk-core';

// ── Render pipeline ───────────────────────────────────────────────────────────

export interface RenderLayer {
    /** GeoJSON source features rendered for this layer. */
    geojson: FeatureCollection;

    /** Triangulation strategy used to mesh the GeoJSON geometries. */
    type: LayerType;

    /** Semantic class bucket used by higher-level render aggregations. */
    classId: string;

    /** Optional source property to be used as a stable object identifier. */
    objectIdProperty?: string;
}

export interface RenderViewSampling {
    /** Number of horizontal render directions generated per source feature. */
    directions?: number;

    /** Starting azimuth in degrees for the first sampled direction. */
    azimuthOffsetDeg?: number;

    /** Shared vertical pitch in degrees applied to every sampled direction. */
    pitchDeg?: number;
}

export type RenderAggregation =
    | {
        type: 'classes';
        /** When true, count the transparent render background as an extra class bucket. */
        includeBackground?: boolean;
        /** Class id used for the transparent render background. @default 'background' */
        backgroundClassId?: string;
    }
    | { type: 'objects' };

export interface RenderPipelineParams {
    /** Geometry layers rendered from each sampled camera. */
    layers: RenderLayer[];

    /** Source features used to derive view origins. */
    source: FeatureCollection;

    /** Reduction strategy applied after the tiled render pass. */
    aggregation: RenderAggregation;

    /** Camera sampling controls for each source origin. */
    viewSampling?: RenderViewSampling;

    /** Horizontal field of view in degrees. @default 90 */
    fov?: number;

    /** Near clipping plane distance. @default 1 */
    near?: number;

    /** Far clipping plane distance. @default 5000 */
    far?: number;

    /** Tile resolution in pixels; must be a multiple of 8. @default 64 */
    tileSize?: number;

}

// ── GPGPU pipeline ────────────────────────────────────────────────────────────

export interface GpgpuPipelineParams {
    /**
     * GeoJSON FeatureCollection to process — one GPU invocation per feature.
     *
     * Each feature's properties are extracted according to {@link variableMapping}
     * and passed as typed parameters to the WGSL compute function.
     */
    collection: FeatureCollection;

    /**
     * Maps WGSL variable names to feature property dot-paths.
     *
     * The path is resolved using {@link valueAtPath} from `autk-core`.
     * Shorthand paths omit the `properties.` prefix.
     */
    variableMapping: Record<string, string>;

    /**
     * Per-feature fixed-length arrays: variable name → element count.
     *
     * Arrays are flattened into a single typed array with stride `featureCount × length`.
     */
    attributeArrays?: Record<string, number>;

    /**
     * Per-feature matrices: variable name → `{ rows, cols }`.
     *
     * Use `rows: 'auto'` to infer the row count per feature at runtime.
     * Matrices are stored in row-major order.
     */
    attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;

    /** Global scalar constants shared across all features for one dispatch. */
    uniforms?: Record<string, number>;

    /** Global fixed-length arrays shared across all features for one dispatch. */
    uniformArrays?: Record<string, number[]>;

    /** Global matrices shared across all features for one dispatch. */
    uniformMatrices?: Record<string, { data: number[][]; cols: number }>;

    /** WGSL function body executed once per feature. */
    wgslBody: string;

    /** Name of the output field written into `properties.compute`. */
    resultField?: string;

    /** Column names for array or vector outputs. */
    outputColumns?: string[];
}
