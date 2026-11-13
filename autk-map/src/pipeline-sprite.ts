/// <reference types="@webgpu/types" />

import spriteVertexSource from './shaders/sprite.vert.wgsl';
import spriteFragmentSource from './shaders/sprite.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';
import { Camera } from '@urban-toolkit/autk-core';
import { SpriteLayer } from './layer-sprite';

export class PipelineSprite extends Pipeline {
    protected _quadBuffer!: GPUBuffer;
    protected _instanceBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
    protected _highlightedBuffer!: GPUBuffer;
    protected _thematicValidityBuffer!: GPUBuffer;
    protected _skippedBuffer!: GPUBuffer;
    protected _indicesBuffer!: GPUBuffer;
    protected _pointSizeBuffer!: GPUBuffer;
    protected _pointBindGroup!: GPUBindGroup;
    protected _pointBindGroupLayout!: GPUBindGroupLayout;
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;
    protected _pipeline!: GPURenderPipeline;

    private _quadData: Float32Array<ArrayBuffer> | null = null;
    private _instanceData: Float32Array<ArrayBuffer> | null = null;
    private _thematicData: Float32Array<ArrayBuffer> | null = null;
    private _highlightedData: Float32Array<ArrayBuffer> | null = null;
    private _thematicValidityData: Float32Array<ArrayBuffer> | null = null;
    private _skippedData: Float32Array<ArrayBuffer> | null = null;
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    private _pointSizeData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4));

    constructor(renderer: Renderer) {
        super(renderer);
    }

    override destroy(): void {
        this._quadBuffer?.destroy();
        this._instanceBuffer?.destroy();
        this._thematicBuffer?.destroy();
        this._highlightedBuffer?.destroy();
        this._thematicValidityBuffer?.destroy();
        this._skippedBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._pointSizeBuffer?.destroy();
        super.destroy();
    }

    build(layer: SpriteLayer): void {
        this.createShaders();
        this.createVertexBuffers(layer);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();
        this.createPointUniformBindGroup();
        this.updateVertexBuffers(layer);
        this.updateColorUniforms(layer);
        this.updatePointSize(layer.pointSize);
        this.createPipeline();
    }

    createShaders(): void {
        this._vertModule = this._renderer.device.createShaderModule({ code: spriteVertexSource });
        this._fragModule = this._renderer.device.createShaderModule({ code: spriteFragmentSource });
    }

    createVertexBuffers(layer: SpriteLayer): void {
        this._quadBuffer = this._renderer.device.createBuffer({
            label: 'Point quad buffer',
            size: 4 * 2 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._instanceBuffer = this._renderer.device.createBuffer({
            label: 'Point instance center buffer',
            size: layer.pointInstances.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._thematicBuffer = this._renderer.device.createBuffer({
            label: 'Point thematic buffer',
            size: layer.thematic.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._highlightedBuffer = this._renderer.device.createBuffer({
            label: 'Point highlighted buffer',
            size: layer.highlightedVertices.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._thematicValidityBuffer = this._renderer.device.createBuffer({
            label: 'Point thematic validity buffer',
            size: layer.thematicValidity.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._skippedBuffer = this._renderer.device.createBuffer({
            label: 'Point skipped buffer',
            size: layer.skippedVertices.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Point quad indices buffer',
            size: 6 * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(layer: SpriteLayer): void {
        this._quadData = this._syncFloatData(this._quadData, [-1, -1, 1, -1, 1, 1, -1, 1]);
        this._instanceData = this._syncFloatData(this._instanceData, layer.pointInstances);
        this._thematicData = this._syncFloatData(this._thematicData, layer.thematic);
        this._highlightedData = this._syncFloatData(this._highlightedData, layer.highlightedVertices);
        this._thematicValidityData = this._syncFloatData(this._thematicValidityData, layer.thematicValidity);
        this._skippedData = this._syncFloatData(this._skippedData, layer.skippedVertices);
        this._indicesData = this._syncUintData(this._indicesData, [0, 1, 2, 0, 2, 3]);

        this._renderer.device.queue.writeBuffer(this._quadBuffer, 0, this._quadData);
        this._renderer.device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceData);
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, this._thematicData);
        this._renderer.device.queue.writeBuffer(this._highlightedBuffer, 0, this._highlightedData);
        this._renderer.device.queue.writeBuffer(this._thematicValidityBuffer, 0, this._thematicValidityData);
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, this._skippedData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
    }

    createPointUniformBindGroup(): void {
        this._pointSizeBuffer = this._renderer.device.createBuffer({
            label: 'Point size buffer',
            size: Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._pointBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {},
            }],
        });

        this._pointBindGroup = this._renderer.device.createBindGroup({
            layout: this._pointBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this._pointSizeBuffer } }],
        });
    }

    updatePointSize(size: number): void {
        this._pointSizeData[0] = size;
        this._renderer.device.queue.writeBuffer(this._pointSizeBuffer, 0, this._pointSizeData);
    }

    createPipeline(): void {
        const quadBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'vertex',
        };
        const instanceBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };
        const thematicBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }],
            arrayStride: Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };
        const highlightedBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }],
            arrayStride: Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };
        const thematicValidityBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 4, offset: 0, format: 'float32' }],
            arrayStride: Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };
        const skippedBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 5, offset: 0, format: 'float32' }],
            arrayStride: Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };

        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [
                quadBufferDesc,
                instanceBufferDesc,
                thematicBufferDesc,
                highlightedBufferDesc,
                thematicValidityBufferDesc,
                skippedBufferDesc,
            ],
        };
        const fragment: GPUFragmentState = {
            module: this._fragModule,
            entryPoint: 'main',
            targets: [{
                format: this._renderer.canvasFormat,
                blend: {
                    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                },
            }],
        };
        const primitive: GPUPrimitiveState = { frontFace: 'cw', cullMode: 'none', topology: 'triangle-list' };
        const multisample: GPUMultisampleState = { count: this._renderer.sampleCount };
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: false,
            depthCompare: 'always',
            format: 'depth32float',
        };

        const layout = this._renderer.device.createPipelineLayout({
            bindGroupLayouts: [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout, this._pointBindGroupLayout],
        });
        this._pipeline = this._renderer.device.createRenderPipeline({
            layout,
            vertex,
            fragment,
            primitive,
            depthStencil,
            multisample,
            label: 'Pipeline sprite',
        });
    }

    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        passEncoder.setPipeline(this._pipeline);
        this.updateCameraUniforms(camera);
        passEncoder.setVertexBuffer(0, this._quadBuffer);
        passEncoder.setVertexBuffer(1, this._instanceBuffer);
        passEncoder.setVertexBuffer(2, this._thematicBuffer);
        passEncoder.setVertexBuffer(3, this._highlightedBuffer);
        passEncoder.setVertexBuffer(4, this._thematicValidityBuffer);
        passEncoder.setVertexBuffer(5, this._skippedBuffer);
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);
        passEncoder.setBindGroup(2, this._pointBindGroup);

        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0 && this._instanceBuffer.size > 0) {
            passEncoder.drawIndexed(indexCount, this._instanceBuffer.size / (2 * Float32Array.BYTES_PER_ELEMENT));
        }
    }
}
