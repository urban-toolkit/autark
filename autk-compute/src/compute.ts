import { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from './compute-gpgpu';
import { ComputeRender } from './compute-render';
import type { GpgpuPipelineParams, RenderPipelineParams } from './api';

export { ComputeGpgpu, ComputeRender };
export { generateViewpoints, buildCameraMatrices } from './viewpoint';
export { GpuPipeline } from './compute-pipeline';

export type { RenderLayer, RenderPipelineParams, GpgpuPipelineParams } from './api';
export type { ComputeConfig, GlobalVarMeta } from './types-gpgpu';
export type { ViewProjectionParams, TypedArray, TypedArrayConstructor } from 'autk-core';

/**
 * Unified compute engine exposing the GPGPU analytical pipeline and the
 * GPU render pipeline as a single, cohesive API.
 */
export class AutkComputeEngine {
    private _gpgpu  = new ComputeGpgpu();
    private _render = new ComputeRender();

    /**
     * Executes a WGSL function over feature properties and writes results
     * into `feature.properties.compute` for every feature in the collection.
     */
    async gpgpuPipeline(params: GpgpuPipelineParams): Promise<FeatureCollection> {
        return this._gpgpu.run(params);
    }

    /**
     * Generates street-level viewpoints from `params.source`, renders the scene
     * from each viewpoint into an offscreen tile, and counts non-sky pixels.
     * Returns the viewpoints annotated with `buildingCoverage` and `skyViewFactor`
     * in `feature.properties.compute`.
     */
    async renderPipeline(params: RenderPipelineParams): Promise<FeatureCollection> {
        return this._render.run(params);
    }
}
