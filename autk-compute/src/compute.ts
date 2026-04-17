import { FeatureCollection } from 'geojson';

import { ComputeGpgpu } from './compute-gpgpu';
import { ComputeRender } from './compute-render';

import type {
    GpgpuPipelineParams,
    RenderPipelineParams,
} from './api';

export { ComputeGpgpu, ComputeRender };
export { generateViewpoints, buildCameraMatrices } from './viewpoint';
export { GpuPipeline } from './compute-pipeline';

export type {
    RenderLayer,
    RenderPipelineParams,
    GpgpuPipelineParams,
} from './api';

export type { ComputeConfig, GlobalVarMeta } from './types-gpgpu';

export type {
    ViewProjectionParams,
    TypedArray,
    TypedArrayConstructor,
} from 'autk-core';

/**
 * Unified compute engine exposing the GPGPU analytical pipeline and the
 * GPU render pipeline as a single, cohesive API.
 *
 * `AutkComputeEngine` provides a simplified interface for urban analytics:
 * - {@link gpgpuPipeline}: Execute WGSL compute shaders over GeoJSON features
 * - {@link renderPipeline}: Generate street-level imagery and compute visibility metrics
 *
 * Both pipelines share a common GPU device and operate on GeoJSON FeatureCollections,
 * writing results to `feature.properties.compute`.
 *
 * @example
 * // Initialize the compute engine
 * const compute = new AutkComputeEngine();
 *
 * @example
 * // Run GPGPU computation: calculate building heights
 * const result = await compute.gpgpuPipeline({
 *   collection: buildings,
 *   variableMapping: { stories: 'properties.stories' },
 *   wgslBody: 'return stories * 3.5;', // assume 3.5m per story
 *   resultField: 'heightMeters'
 * });
 *
 * @example
 * // Run render pipeline: compute sky view factors
 * const result = await compute.renderPipeline({
 *   layers: [{
 *     geojson: buildings,
 *     color: { r: 128, g: 128, b: 128, alpha: 1 },
 *     type: 'buildings'
 *   }],
 *   source: streetNetwork,
 *   eyeHeight: 1.7,
 *   fov: 90,
 *   tileSize: 64
 * });
 *
 * @see {@link ComputeGpgpu} for the GPGPU pipeline implementation.
 * @see {@link ComputeRender} for the render pipeline implementation.
 * @see {@link generateViewpoints} for viewpoint generation.
 */
export class AutkComputeEngine {
    private _gpgpu = new ComputeGpgpu();
    private _render = new ComputeRender();

    /**
     * Executes a WGSL function over feature properties and writes results
     * into `feature.properties.compute` for every feature in the collection.
     *
     * This is a convenience wrapper around {@link ComputeGpgpu.run}.
     *
     * @param params - GPGPU pipeline parameters.
     * @param params.collection - GeoJSON FeatureCollection to process.
     * @param params.variableMapping - Maps WGSL variable names to property paths.
     * @param params.attributeArrays - Per-feature fixed-length arrays.
     * @param params.attributeMatrices - Per-feature matrices.
     * @param params.uniforms - Global scalar constants.
     * @param params.uniformArrays - Global array constants.
     * @param params.uniformMatrices - Global matrix constants.
     * @param params.wgslBody - WGSL function body.
     * @param params.resultField - Single output field (optional).
     * @param params.outputColumns - Multiple output fields (optional).
     * @returns Promise resolving to FeatureCollection with results in `.properties.compute`.
     *
     * @example
     * // Simple scalar computation
     * const result = await compute.gpgpuPipeline({
     *   collection: parcels,
     *   variableMapping: { area: 'properties.area' },
     *   wgslBody: 'return area * 0.0001;', // convert to hectares
     *   resultField: 'areaHectares'
     * });
     *
     * @example
     * // Multiple outputs with arrays
     * const result = await compute.gpgpuPipeline({
     *   collection: buildings,
     *   variableMapping: { orientation: 'properties.rotation' },
     *   attributeArrays: { monthlyShading: 12 },
     *   uniforms: { sunAngle: 45 },
     *   wgslBody: `
     *     var result: OutputArray;
     *     for (var i = 0u; i < 12u; i++) {
     *       result[i] = computeMonthlyShading(orientation, monthlyShading[i], sunAngle);
     *     }
     *     return result;
     *   `,
     *   outputColumns: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
     * });
     */
    async gpgpuPipeline(params: GpgpuPipelineParams): Promise<FeatureCollection> {
        return this._gpgpu.run(params);
    }

    /**
     * Generates street-level viewpoints from `params.source`, renders the scene
     * from each viewpoint into an offscreen tile, and counts non-sky pixels.
     *
     * Returns the viewpoints annotated with `buildingCoverage` and `skyViewFactor`
     * in `feature.properties.compute`.
     *
     * This is a convenience wrapper around {@link ComputeRender.run}.
     *
     * @param params - Render pipeline parameters.
     * @param params.layers - Geometry layers to render.
     * @param params.source - Source for viewpoint generation; one viewpoint per feature centroid.
     * @param params.eyeHeight - Camera eye height (default: 1.7).
     * @param params.fov - Horizontal FOV in degrees (default: 90).
     * @param params.near - Near clip plane (default: 1).
     * @param params.far - Far clip plane (default: 5000).
     * @param params.tileSize - Tile resolution in pixels, must be multiple of 8 (default: 64).
     * @param params.clearColor - Background color [R, G, B, A] in [0–1] (default: [0, 0, 0, 1]).
     * @returns Promise resolving to FeatureCollection of viewpoints with visibility metrics.
     *
     * @example
     * // Compute sky view factors for a street network
     * const result = await compute.renderPipeline({
     *   layers: [{
     *     geojson: buildings,
     *     color: { r: 100, g: 100, b: 100, alpha: 1 },
     *     type: 'buildings'
     *   }],
     *   source: streets,
     *   eyeHeight: 1.7,
     *   fov: 90
     * });
     *
     * // Access results
     * result.features.forEach(f => {
     *   const { buildingCoverage, skyViewFactor } = f.properties.compute;
     *   console.log(`Sky visibility: ${(skyViewFactor * 100).toFixed(1)}%`);
     * });
     */
    async renderPipeline(params: RenderPipelineParams): Promise<FeatureCollection> {
        return this._render.run(params);
    }
}
