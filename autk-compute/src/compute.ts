/**
 * @module AutkCompute
 * Unified GPU compute entry point for feature analysis and render sampling.
 *
 * This module exposes `AutkComputeEngine`, which coordinates the GPGPU and
 * render pipelines over shared GeoJSON feature collections.
 */

import { FeatureCollection } from 'geojson';

import { ComputeGpgpu } from './compute-gpgpu';
import { ComputeRender } from './compute-render';

import type {
    GpgpuPipelineParams,
    RenderPipelineParams,
} from './api';

export type {
    RenderLayer,
    RenderViewSampling,
    RenderViewpointStrategy,
    RenderViewpoints,
    RenderCameraOptions,
    RenderAggregation,
    GpgpuPipelineParams,
    RenderPipelineParams,
} from './api';

/**
 * Main compute engine for GPGPU analysis and render sampling.
 *
 * `AutkComputeEngine` provides the package-level API for running analytical and
 * render compute passes. It accepts GeoJSON feature collections and writes the
 * results back to `feature.properties.compute` on the returned collection.
 *
 * @example
 * const compute = new AutkComputeEngine();
 * await compute.gpgpuPipeline(params);
 */
export class AutkComputeEngine {
    /** Shared GPGPU pipeline implementation. */
    private _gpgpu = new ComputeGpgpu();
    /** Shared render pipeline implementation. */
    private _render = new ComputeRender();

    /**
     * Runs the GPGPU pipeline and writes results to `feature.properties.compute`.
     *
     * @param params Pipeline parameters.
     * @returns Promise resolving to the input collection with computed values attached.
     * @throws If `resultField` or `outputColumns` is missing, or WGSL identifiers are invalid.
     * @example
     * const engine = new AutkComputeEngine();
     * const result = await engine.gpgpuPipeline({
     *   collection: fc,
     *   variableMapping: { pop: 'properties.population' },
     *   wgslBody: 'return pop * 1.5;',
     *   resultField: 'scaledPop',
     * });
     */
    async gpgpuPipeline(params: GpgpuPipelineParams): Promise<FeatureCollection> {
        return this._gpgpu.run(params);
    }

    /**
     * Runs the render pipeline and writes metrics to `feature.properties.compute.render`.
     *
     * @param params Pipeline parameters.
     * @returns Promise resolving to the viewpoints collection with aggregated render metrics.
     * @throws If no layers are provided or `tileSize` is invalid.
     * @example
     * const engine = new AutkComputeEngine();
     * const result = await engine.renderPipeline({
     *   layers: [{ id: 'b', collection: fc, type: 'buildings' }],
     *   viewpoints: { collection: vpFC },
     *   aggregation: { type: 'classes' },
     * });
     */
    async renderPipeline(params: RenderPipelineParams): Promise<FeatureCollection> {
        return this._render.run(params);
    }
}
