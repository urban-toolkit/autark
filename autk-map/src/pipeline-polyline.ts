/// <reference types="@webgpu/types" />

import type { Camera } from '@urban-toolkit/autk-core';
import { TriangulatorPolylines } from '@urban-toolkit/autk-core';
import { DEFAULT_LINE_WIDTH } from './types-layers';
import { Pipeline } from './pipeline';
import type { PolylineLayer } from './layer-polyline';
import type { Renderer } from './renderer';
import expansionSource from './shaders/polyline-expansion.wgsl';
import vertexSource from './shaders/polyline.vert.wgsl';
import pickingVertexSource from './shaders/polyline-picking.vert.wgsl';
import fragmentSource from './shaders/triangle-01.frag.wgsl';
import pickingFragmentSource from './shaders/polyline-picking.frag.wgsl';

/** Shader-expanded centerline pipeline, with identical topology for display and picking. */
export class PipelinePolyline extends Pipeline {
    private _positionBuffer!: GPUBuffer;
    private _attributesBuffer!: GPUBuffer;
    private _widthsBuffer!: GPUBuffer;
    private _stateBuffer!: GPUBuffer;
    private _indicesBuffer!: GPUBuffer;
    private _widthBuffer!: GPUBuffer;
    private _widthBindGroup!: GPUBindGroup;
    private _widthBindGroupLayout!: GPUBindGroupLayout;
    private _pipeline!: GPURenderPipeline;
    private _indexCount = 0;
    private _widthData = new Float32Array(1);
    private _stateData: Float32Array<ArrayBuffer> | null = null;
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    private _attributesData: Float32Array<ArrayBuffer> | null = null;
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    private _widthsData: Float32Array<ArrayBuffer> | null = null;
    private _defaultWidths?: Float32Array;

    constructor(renderer: Renderer, private readonly picking = false) {
        super(renderer);
    }

    build(layer: PolylineLayer): void {
        this.createVertexBuffers(layer);
        this.createCameraUniformBindGroup();
        if (!this.picking) { this.createColorUniformBindGroup(); }
        this._widthBuffer = this._renderer.device.createBuffer({
            label: 'Polyline width override', size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._widthBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
            ],
        });
        this._widthBindGroup = this._renderer.device.createBindGroup({
            layout: this._widthBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this._widthBuffer } },
                { binding: 1, resource: { buffer: this._attributesBuffer } },
            ],
        });
        this.updateVertexBuffers(layer);
        this.updateColorUniforms(layer);

        const device = this._renderer.device;
        const stateAttributes: GPUVertexAttribute[] = this.picking
            ? [{ shaderLocation: 5, offset: 0, format: 'float32x3' }, { shaderLocation: 8, offset: 12, format: 'float32' }]
            : [5, 6, 7, 8].map((shaderLocation, i) => ({ shaderLocation, offset: i * 4, format: 'float32' }));
        this._pipeline = device.createRenderPipeline({
            label: this.picking ? 'Pipeline polyline picking' : 'Pipeline polyline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.picking
                    ? [this._cameraBindGroupLayout, this._widthBindGroupLayout]
                    : [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout, this._widthBindGroupLayout],
            }),
            vertex: {
                module: device.createShaderModule({ code: `${expansionSource}\n${this.picking ? pickingVertexSource : vertexSource}` }),
                entryPoint: 'main',
                buffers: [
                    { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
                    { arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32' }] },
                    { arrayStride: 16, attributes: stateAttributes },
                ],
            },
            fragment: {
                module: device.createShaderModule({ code: this.picking ? pickingFragmentSource : fragmentSource }),
                entryPoint: 'main',
                targets: [{
                    format: this.picking ? 'rgba8unorm' : this._renderer.canvasFormat,
                    ...(this.picking ? {} : { blend: {
                        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    } as GPUBlendState }),
                }],
            },
            primitive: { topology: 'triangle-list', frontFace: 'cw', cullMode: 'none' },
            depthStencil: { format: 'depth32float', depthWriteEnabled: this.picking, depthCompare: 'greater-equal' },
            multisample: { count: this.picking ? 1 : this._renderer.sampleCount },
        });
    }

    createVertexBuffers(layer: PolylineLayer): void {
        const device = this._renderer.device;
        const vertexCount = layer.position.length / 2;
        this._positionBuffer = device.createBuffer({ label: 'Polyline centers', size: layer.position.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        this._attributesBuffer = device.createBuffer({ label: 'Polyline adjacency', size: layer.polylineAttributes.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._widthsBuffer = device.createBuffer({ label: 'Polyline default widths', size: vertexCount * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        this._stateBuffer = device.createBuffer({ label: 'Polyline feature state', size: vertexCount * 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        this._indicesBuffer = device.createBuffer({ label: 'Polyline topology', size: layer.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    }

    updateVertexBuffers(layer: PolylineLayer): void {
        this._positionData = this._syncFloatData(this._positionData, layer.position);
        this._attributesData = this._syncFloatData(this._attributesData, layer.polylineAttributes);
        this._indicesData = this._syncUintData(this._indicesData, layer.indices);
        this._indexCount = layer.indices.length;
        const count = layer.position.length / 2;
        this._stateData = this._syncFloatLength(this._stateData, count * 4);
        for (let component = 0; component < layer.components.length; component++) {
            const start = component === 0 ? 0 : layer.components[component - 1].nPoints;
            const end = layer.components[component].nPoints;
            const id = component + 1;
            for (let i = start; i < end; i++) {
                this._stateData[i * 4] = this.picking ? (id & 0xff) / 255 : layer.thematic[i];
                this._stateData[i * 4 + 1] = this.picking ? ((id >> 8) & 0xff) / 255 : layer.highlightedVertices[i];
                this._stateData[i * 4 + 2] = this.picking ? ((id >> 16) & 0xff) / 255 : layer.thematicValidity[i];
                this._stateData[i * 4 + 3] = layer.skippedVertices[i];
            }
        }
        const queue = this._renderer.device.queue;
        queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        queue.writeBuffer(this._attributesBuffer, 0, this._attributesData);
        queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
        queue.writeBuffer(this._stateBuffer, 0, this._stateData);
        // Geometry replacement can change component ranges even when styles stay the same.
        this._widthsData = null;
        this.updateWidth(layer);
    }

    /** Updates only render-state resources; a uniform override never reuploads geometry. */
    updateWidth(layer: PolylineLayer): void {
        this._widthData[0] = layer.layerRenderInfo.polylinesWidth ?? 0;
        this._renderer.device.queue.writeBuffer(this._widthBuffer, 0, this._widthData);
        const widths = layer.layerRenderInfo.polylinesWidthByComponent;
        if (this._widthsData && widths === this._defaultWidths) { return; }
        this._defaultWidths = widths;
        this._widthsData = this._syncFloatLength(this._widthsData, layer.position.length / 2);
        for (let component = 0; component < layer.components.length; component++) {
            const start = component === 0 ? 0 : layer.components[component - 1].nPoints;
            const end = layer.components[component].nPoints;
            const width = widths?.[component];
            const fallback = layer.layerInfo.typeLayer === 'roads'
                ? TriangulatorPolylines.DEFAULT_ROAD_HALF_WIDTH * 2
                : DEFAULT_LINE_WIDTH;
            this._widthsData.fill(typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : fallback, start, end);
        }
        this._renderer.device.queue.writeBuffer(this._widthsBuffer, 0, this._widthsData);
    }

    override updateColorUniforms(layer: PolylineLayer): void {
        if (!this.picking) { super.updateColorUniforms(layer); }
        this.updateWidth(layer);
    }

    renderPass(camera: Camera, passEncoder?: GPURenderPassEncoder): void {
        const ownsPass = !passEncoder;
        if (!passEncoder && !this.picking) { return; }
        passEncoder ??= this._renderer.commandEncoder.beginRenderPass({
            colorAttachments: [this._renderer.pickingBuffer],
            depthStencilAttachment: this._renderer.pickingDepthBuffer,
        });
        this.updateCameraUniforms(camera);
        passEncoder.setPipeline(this._pipeline);
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._widthsBuffer);
        passEncoder.setVertexBuffer(2, this._stateBuffer);
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');
        if (!this.picking) { passEncoder.setBindGroup(0, this._renderInfoBindGroup); }
        passEncoder.setBindGroup(this.picking ? 0 : 1, this._cameraBindGroup);
        passEncoder.setBindGroup(this.picking ? 1 : 2, this._widthBindGroup);
        if (this._indexCount > 0) { passEncoder.drawIndexed(this._indexCount); }
        if (ownsPass) { passEncoder.end(); }
    }

    override destroy(): void {
        this._positionBuffer?.destroy();
        this._attributesBuffer?.destroy();
        this._widthsBuffer?.destroy();
        this._stateBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._widthBuffer?.destroy();
        super.destroy();
    }
}
