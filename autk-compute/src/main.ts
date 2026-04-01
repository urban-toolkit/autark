import { FeatureCollection } from 'geojson';
import { GeojsonCompute } from './geojson/geojson-compute';
import { RenderCompute, RenderComputeParams }  from './render-compute/render-compute';
import { ComputeFunctionIntoPropertiesParams } from './geojson/interfaces';

export { GeojsonCompute };
export { RenderCompute };
export type { RenderLayer, RenderComputeParams } from './render-compute/render-compute';
export { buildViewProjection } from './render-compute/camera';
export type { ViewProjectionParams }             from './render-compute/camera';
export type { ComputeFunctionIntoPropertiesParams } from './geojson/interfaces';

/**
 * Unified compute engine that exposes both GPU-analytical (WGSL over feature properties)
 * and GPU-render (off-screen rendering metrics) capabilities.
 */
export class AutkComputeEngine {
    private _geojsonCompute = new GeojsonCompute();
    private _renderCompute  = new RenderCompute();

    /**
     * Executes a WGSL function over feature properties and writes results
     * into `feature.properties.compute[resultField]` for every feature.
     */
    async analytical(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
        return this._geojsonCompute.analytical(params);
    }

    /**
     * Renders each viewpoint into an offscreen tile and counts non-sky pixels,
     * returning the viewpoints collection enriched with `buildingCoverage` and
     * `skyViewFactor` in `feature.properties.compute`.
     */
    async renderIntoMetrics(params: RenderComputeParams): Promise<FeatureCollection> {
        return this._renderCompute.renderIntoMetrics(params);
    }
}
