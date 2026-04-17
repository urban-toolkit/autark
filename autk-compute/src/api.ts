import { FeatureCollection } from 'geojson';

import {
    ColorRGB,
    LayerType,
} from 'autk-core';

// ── Render pipeline ───────────────────────────────────────────────────────────

/**
 * A single geometry layer rendered from each viewpoint.
 *
 * `RenderLayer` pairs GeoJSON source features with a color and triangulation
 * strategy, forming one input to the {@link ComputeRender} pipeline.
 *
 * @example
 * // A parks layer with green color
 * const parksLayer: RenderLayer = {
 *   geojson: parksGeoJSON,
 *   color: { r: 34, g: 139, b: 34, alpha: 0.8 },
 *   type: 'parks'
 * };
 *
 * @example
 * // Buildings layer with gray color
 * const buildingsLayer: RenderLayer = {
 *   geojson: buildingsGeoJSON,
 *   color: ColorMap.getColor('buildings'),
 *   type: 'buildings'
 * };
 */
export interface RenderLayer {
    /**
     * GeoJSON source features for this layer.
     *
     * The geometry type must match the `type` field (e.g., Polygon features
     * for `type: 'polygons'`). Features are triangulated using the strategy
     * specified by {@link type}.
     */
    geojson: FeatureCollection;

    /**
     * Layer colour as RGBA components.
     *
     * `r`, `g`, `b` are in [0–255]; `alpha` is in [0–1].
     * Use {@link ColorMap.getColor} or a literal `{ r, g, b, alpha }` to build this.
     *
     * @example
     * // Opaque red
     * color: { r: 255, g: 0, b: 0, alpha: 1.0 }
     *
     * @example
     * // Semi-transparent blue
     * color: { r: 0, g: 100, b: 255, alpha: 0.5 }
     */
    color: ColorRGB;

    /**
     * Triangulation strategy — determines how the GeoJSON geometry is meshed.
     *
     * The layer type selects the appropriate triangulator from `autk-core`:
     * - `'buildings'` — 3D extruded building footprints
     * - `'polygons'`, `'surface'`, `'water'`, `'parks'` — 2D polygon meshing
     * - `'roads'`, `'polylines'` — line extrusion with rounded caps
     * - `'points'` — point sprites
     */
    type: LayerType;
}

/**
 * Parameters for {@link ComputeRender.run}.
 *
 * Configures a complete render pass: layers to draw, source data for viewpoint
 * generation, camera settings, and tile configuration.
 *
 * @example
 * // Basic render configuration
 * const params: RenderPipelineParams = {
 *   layers: [buildingsLayer, roadsLayer],
 *   source: streetNetwork,
 *   eyeHeight: 1.7,
 *   fov: 90,
 *   tileSize: 64
 * };
 *
 * @example
 * // Custom camera and clear color
 * const params: RenderPipelineParams = {
 *   layers: [buildingsLayer],
 *   source: viewpoints,
 *   eyeHeight: 2.0,
 *   fov: 120,
 *   near: 0.5,
 *   far: 10000,
 *   clearColor: [0.1, 0.1, 0.2, 1.0] // dark blue sky
 * };
 */
export interface RenderPipelineParams {
    /**
     * Geometry layers rendered from each viewpoint.
     *
     * Layers are rendered in the order specified, with later layers drawn on top.
     * Each layer must have a unique triangulation strategy.
     */
    layers: RenderLayer[];

    /**
     * Source FeatureCollection used to generate viewpoints.
     *
     * One viewpoint is generated per feature using its centroid.
     *
     * @see {@link generateViewpoints} for the viewpoint generation algorithm.
     */
    source: FeatureCollection;

    /**
     * Camera eye height above ground in scene units (metres).
     * @default 1.7 — average human eye height
     */
    eyeHeight?: number;

    /**
     * Horizontal field of view in degrees.
     * @default 90 — wide-angle view suitable for street-level imagery
     */
    fov?: number;

    /**
     * Near clipping plane distance in scene units.
     * @default 1
     */
    near?: number;

    /**
     * Far clipping plane distance in scene units.
     * @default 5000
     */
    far?: number;

    /**
     * Tile resolution in pixels — must be a multiple of 8.
     *
     * Each viewpoint is rendered into a square tile of this size.
     * Tiles are packed into a larger texture grid for batch processing.
     *
     * @default 64
     */
    tileSize?: number;

    /**
     * Background sky colour as [R, G, B, A] in [0–1].
     * @default [0, 0, 0, 1] — opaque black
     */
    clearColor?: [number, number, number, number];
}

// ── GPGPU pipeline ────────────────────────────────────────────────────────────

/**
 * Parameters for {@link ComputeGpgpu.run}.
 *
 * Configures a GPGPU computation over feature properties. Each feature in the
 * collection receives one GPU thread, and results are written back to
 * `feature.properties.compute`.
 *
 * @example
 * // Simple scalar computation: calculate floor area ratio
 * const params: GpgpuPipelineParams = {
 *   collection: buildings,
 *   variableMapping: { height: 'properties.height', footprint: 'properties.area' },
 *   wgslBody: `return height * footprint;`,
 *   resultField: 'floorAreaRatio'
 * };
 *
 * @example
 * // Multiple outputs with arrays: compute hourly solar irradiance
 * const params: GpgpuPipelineParams = {
 *   collection: parcels,
 *   variableMapping: { orientation: 'properties.rotation' },
 *   attributeArrays: { hourlyShading: 24 },
 *   uniforms: { sunAzimuth: 180, sunElevation: 45 },
 *   wgslBody: `
 *     var result: OutputArray;
 *     for (var i = 0u; i < 24u; i++) {
 *       result[i] = computeIrradiance(orientation, hourlyShading[i], sunAzimuth, sunElevation);
 *     }
 *     return result;
 *   `,
 *   outputColumns: ['h00', 'h01', 'h02', ...  'h23']
 * };
 */
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
     *
     * @example
     * // Full path syntax
     * { height: 'properties.height' }
     *
     * @example
     * // Shorthand (equivalent to 'properties.height')
     * { height: 'height' }
     *
     * @example
     * // Nested property
     * { population: 'demographics.total' }
     */
    variableMapping: Record<string, string>;

    /**
     * Per-feature fixed-length arrays: variable name → element count.
     *
     * Arrays are flattened into a single typed array with stride `featureCount × length`.
     *
     * @example
     * // 24-element array for hourly values
     * { hourlyTemp: 24 }
     */
    attributeArrays?: Record<string, number>;

    /**
     * Per-feature matrices: variable name → `{ rows, cols }`.
     *
     * Use `rows: 'auto'` to infer the row count per feature at runtime.
     * Matrices are stored in row-major order.
     *
     * @example
     * // Fixed 4×4 transformation matrix
     * { transform: { rows: 4, cols: 4 } }
     *
     * @example
     * // Variable-row matrix (e.g., irregular time series)
     * { data: { rows: 'auto', cols: 3 } }
     */
    attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;

    /**
     * Global scalar constants shared across all features (uploaded once to the GPU).
     *
     * Suitable for values like sun angles, thresholds, or day-of-year that remain
     * constant during the computation.
     *
     * @example
     * // Solar position constants
     * { sunAzimuth: 180, sunElevation: 45, dayOfYear: 100 }
     */
    uniforms?: Record<string, number>;

    /**
     * Global array constants shared across all features.
     *
     * @example
     * // Hourly temperature profile
     * { hourlyTemp: [15, 14, 13, /* ... *\/] }
     */
    uniformArrays?: Record<string, number[]>;

    /**
     * Global matrix constants shared across all features.
     *
     * @example
     * // 4×4 rotation matrix
     * { rotation: { data: [[1,0,0,0], /* ... *\/], cols: 4 } }
     */
    uniformMatrices?: Record<string, { data: number[][]; cols: number }>;

    /**
     * WGSL function body. All mapped variables arrive as typed parameters.
     *
     * The function must return:
     * - `f32` for a single output (when using {@link resultField})
     * - `OutputArray` for multiple outputs (when using {@link outputColumns})
     *
     * @example
     * // Single scalar output
     * `return height * footprint;`
     *
     * @example
     * // Multiple outputs
     * `
     *   var result: OutputArray;
     *   result[0] = value1;
     *   result[1] = value2;
     *   return result;
     * `
     */
    wgslBody: string;

    /**
     * Single output column written to `feature.properties.compute[resultField]`.
     *
     * Mutually exclusive with {@link outputColumns} — if both are provided,
     * `outputColumns` takes priority.
     */
    resultField?: string;

    /**
     * Multiple output columns written to `feature.properties.compute`.
     *
     * Takes priority over {@link resultField} when both are specified.
     * The number of columns determines the size of the `OutputArray` alias
     * generated in the WGSL shader.
     *
     * @example
     * // Hourly outputs for a 24-hour simulation
     * ['h00', 'h01', 'h02', /* ... *\/ 'h23']
     */
    outputColumns?: string[];
}
