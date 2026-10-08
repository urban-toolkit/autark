import type { Camera } from '@urban-toolkit/autk-core';
import { VectorLayer } from './layer-vector';
import { PipelinePolyline } from './pipeline-polyline';
import type { LayerData } from './types-layers';
import type { Renderer } from './renderer';

/** Centerline layer whose visual width is resolved only by the render/picking shaders. */
export class PolylineLayer extends VectorLayer {
    declare protected _pipeline: PipelinePolyline;
    declare protected _pipelinePicking: PipelinePolyline;
    // Initialized by the parent's polymorphic loadLayerData call; do not emit a field initializer.
    declare private _polylineAttributes: Float32Array;

    get polylineAttributes(): Float32Array { return this._polylineAttributes; }

    override loadLayerData(data: LayerData): void {
        const vertexCount = data.geometry.reduce((count, geometry) => count + geometry.position.length / 2, 0);
        if (!data.polylineAttributes || vertexCount % 5 !== 0 || data.polylineAttributes.length !== vertexCount / 5 * 4) {
            throw new Error('PolylineLayer requires width-independent adjacency attributes for every centerline node.');
        }
        this._polylineAttributes = data.polylineAttributes;
        super.loadLayerData(data);
    }

    override createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelinePolyline(renderer);
        this._pipeline.build(this);
        this._pipelinePicking = new PipelinePolyline(renderer, true);
        this._pipelinePicking.build(this);
    }

    override renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        // Picking must use the new width even if it executes before the visible pass.
        this._pipelinePicking.updateWidth(this);
        super.renderPass(camera, passEncoder);
    }

    override renderPickingPass(camera: Camera, passEncoder?: GPURenderPassEncoder): void {
        if (this._dataIsDirty) {
            this._pipeline.updateVertexBuffers(this);
            this._pipelinePicking.updateVertexBuffers(this);
            this._dataIsDirty = false;
        }
        this._pipelinePicking.updateWidth(this);
        super.renderPickingPass(camera, passEncoder);
    }
}
