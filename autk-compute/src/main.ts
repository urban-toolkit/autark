import { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from './compute-gpgpu';
import { ComputeRender, RenderComputeParams }  from './compute-render';
import { ComputeFunctionIntoPropertiesParams } from './interfaces';

export { ComputeGpgpu, ComputeRender };
export { GpuPipeline } from './compute-pipeline';

export type { RenderLayer, RenderComputeParams } from './compute-render';
export type { ViewProjectionParams } from 'autk-core';
export type { ComputeFunctionIntoPropertiesParams, ComputeResult } from './interfaces';
export type { ComputeConfig, TypedArray, TypedArrayConstructor } from './compute-pipeline';

/**
 * Unified compute engine that exposes both GPU-analytical (WGSL over feature properties)
 * and GPU-render (off-screen rendering metrics) capabilities.
 */
export class AutkComputeEngine {
    private _gpgpu = new ComputeGpgpu();
    private _render  = new ComputeRender();

    /**
     * Executes a WGSL function over feature properties and writes results
     * into `feature.properties.compute[resultField]` for every feature.
     */
    async analytical(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
        return this._gpgpu.exec(params);
    }

    /**
     * Renders each viewpoint into an offscreen tile and counts non-sky pixels,
     * returning the viewpoints collection enriched with `buildingCoverage` and
     * `skyViewFactor` in `feature.properties.compute`.
     */
    async renderIntoMetrics(params: RenderComputeParams): Promise<FeatureCollection> {
        return this._render.renderIntoMetrics(params);
    }
}
