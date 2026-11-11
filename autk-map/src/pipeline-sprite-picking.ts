/// <reference types="@webgpu/types" />

import pickingVertexSource from './shaders/sprite-picking.vert.wgsl';
import pickingFragmentSource from './shaders/sprite-picking.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';
import { Camera } from '@urban-toolkit/autk-core';
import { SpriteLayer } from './layer-sprite';

export class PipelineSpritePicking extends Pipeline {
    private _quadBuffer!: GPUBuffer;
    private _instanceBuffer!: GPUBuffer;
    private _objectIdsBuffer!: GPUBuffer;
    private _indicesBuffer!: GPUBuffer;
    private _pointSizeBuffer!: GPUBuffer;
    private _pointBindGroup!: GPUBindGroup;
    private _pointBindGroupLayout!: GPUBindGroupLayout;
    private _vertModule!: GPUShaderModule;
    private _fragModule!: GPUShaderModule;
    private _pipeline!: GPURenderPipeline;

    private _quadData: Float32Array<ArrayBuffer> | null = null;
    private _instanceData: Float32Array<ArrayBuffer> | null = null;
    private _objectIdsData: Float32Array<ArrayBuffer> | null = null;
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    private _pointSizeData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4));

    constructor(renderer: Renderer) {
        super(renderer);
    }

    override destroy(): void {
        this._quadBuffer?.destroy();
        this._instanceBuffer?.destroy();
        this._objectIdsBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._pointSizeBuffer?.destroy();
        super.destroy();
    }

    build(layer: SpriteLayer): void {
        this.createShaders();
        this.createVertexBuffers(layer);
        this.createCameraUniformBindGroup();
        this.createPointUniformBindGroup();
        this.updateVertexBuffers(layer);
        this.updatePointSize(layer.pointSize);
        this.createPipeline();
    }

    createShaders(): void {
        this._vertModule = this._renderer.device.createShaderModule({ code: pickingVertexSource });
        this._fragModule = this._renderer.device.createShaderModule({ code: pickingFragmentSource });
    }

    createVertexBuffers(layer: SpriteLayer): void {
        this._quadBuffer = this._renderer.device.createBuffer({
            label: 'Point picking quad buffer',
            size: 4 * 2 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._instanceBuffer = this._renderer.device.createBuffer({
            label: 'Point picking center buffer',
            size: layer.pointInstances.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._objectIdsBuffer = this._renderer.device.createBuffer({
            label: 'Point picking ids buffer',
            size: layer.instanceCount * 3 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Point picking quad indices buffer',
            size: 6 * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(layer: SpriteLayer): void {
        this._quadData = this._syncFloatData(this._quadData, [-1, -1, 1, -1, 1, 1, -1, 1]);
        this._instanceData = this._syncFloatData(this._instanceData, layer.pointInstances);
        this._indicesData = this._syncUintData(this._indicesData, [0, 1, 2, 0, 2, 3]);
        this._objectIdsData = this._syncFloatLength(this._objectIdsData, layer.instanceCount * 3);
        this._objectIdsData.fill(0);

        for (let compId = 0; compId < layer.components.length; compId++) {
            const color = this._encodeIdToRGB(compId);
            const start = compId > 0 ? layer.components[compId - 1].nPoints : 0;
            const end = layer.components[compId].nPoints;
            for (let instanceId = start; instanceId < end; instanceId++) {
                const base = instanceId * 3;
                this._objectIdsData[base + 0] = color[0];
                this._objectIdsData[base + 1] = color[1];
                this._objectIdsData[base + 2] = color[2];
            }
        }

        this._renderer.device.queue.writeBuffer(this._quadBuffer, 0, this._quadData);
        this._renderer.device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceData);
        this._renderer.device.queue.writeBuffer(this._objectIdsBuffer, 0, this._objectIdsData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
    }

    private _encodeIdToRGB(id: number): [number, number, number] {
        const shifted = id + 1;
        return [
            (shifted & 0xff) / 255,
            ((shifted >> 8) & 0xff) / 255,
            ((shifted >> 16) & 0xff) / 255,
        ];
    }

    createPointUniformBindGroup(): void {
        this._pointSizeBuffer = this._renderer.device.createBuffer({
            label: 'Point picking size buffer',
            size: Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._pointBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
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

    private createPipeline(): void {
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
        const idsBufferDesc: GPUVertexBufferLayout = {
            attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
            arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
        };

        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [quadBufferDesc, instanceBufferDesc, idsBufferDesc],
        };
        const fragment: GPUFragmentState = {
            module: this._fragModule,
            entryPoint: 'main',
            targets: [{ format: 'rgba8unorm' }],
        };
        const primitive: GPUPrimitiveState = { frontFace: 'cw', cullMode: 'none', topology: 'triangle-list' };
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: false,
            depthCompare: 'always',
            format: 'depth32float',
        };
        const layout = this._renderer.device.createPipelineLayout({
            bindGroupLayouts: [this._cameraBindGroupLayout, this._pointBindGroupLayout],
        });
        this._pipeline = this._renderer.device.createRenderPipeline({
            layout,
            vertex,
            fragment,
            primitive,
            depthStencil,
            label: 'Pipeline sprite picking',
        });
    }

    renderPass(camera: Camera, passEncoder?: GPURenderPassEncoder): void {
        const ownsPass = !passEncoder;
        passEncoder ??= this._renderer.commandEncoder.beginRenderPass({
            colorAttachments: [this._renderer.pickingBuffer],
            depthStencilAttachment: this._renderer.pickingDepthBuffer,
        });
        passEncoder.setPipeline(this._pipeline);
        this.updateCameraUniforms(camera);
        passEncoder.setVertexBuffer(0, this._quadBuffer);
        passEncoder.setVertexBuffer(1, this._instanceBuffer);
        passEncoder.setVertexBuffer(2, this._objectIdsBuffer);
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');
        passEncoder.setBindGroup(0, this._cameraBindGroup);
        passEncoder.setBindGroup(1, this._pointBindGroup);
        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0 && this._instanceBuffer.size > 0) {
            passEncoder.drawIndexed(indexCount, this._instanceBuffer.size / (2 * Float32Array.BYTES_PER_ELEMENT));
        }
        if (ownsPass) {
            passEncoder.end();
        }
    }
}
