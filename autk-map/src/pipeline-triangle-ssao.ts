/// <reference types="@webgpu/types" />

import buildingsVS01 from './shaders/buildings-01.vert.wgsl';
import buildingsFS01 from './shaders/buildings-01.frag.wgsl';

import buildingsVS02 from './shaders/buildings-02.vert.wgsl';
import buildingsFS02 from './shaders/buildings-02.frag.wgsl';

import { Camera } from './types-core';
import { Renderer } from './renderer';

import { Pipeline } from './pipeline';
import { Triangles3DLayer } from './layer-triangles3D';

type SharedSsaoState = {
    colorsSharedBuffer: GPURenderPassColorAttachment;
    normalsSharedBuffer: GPURenderPassColorAttachment;
    depthBufferPass01: GPURenderPassDepthStencilAttachment;
    colorsSharedTexture: GPUTexture;
    normalsSharedTexture: GPUTexture;
    depthTexturePass01: GPUTexture;
    texturesPass02BindGroup: GPUBindGroup;
    texturesPass02BindGroupLayout: GPUBindGroupLayout;
    pipeline02: GPURenderPipeline;
    width: number;
    height: number;
};

/**
 * Geometry pipeline for 3D building layers and shared SSAO composite helpers.
 */
export class PipelineBuildingSSAO extends Pipeline {
    private static _sharedState = new WeakMap<Renderer, SharedSsaoState>();

    protected _positionBuffer!: GPUBuffer;
    protected _normalBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
    protected _thematicValidityBuffer!: GPUBuffer;
    protected _highlightedBuffer!: GPUBuffer;
    protected _skippedBuffer!: GPUBuffer;
    protected _indicesBuffer!: GPUBuffer;

    protected _vertModule01!: GPUShaderModule;
    protected _fragModule01!: GPUShaderModule;
    protected _pipeline01!: GPURenderPipeline;

    private _positionData: Float32Array<ArrayBuffer> | null = null;
    private _normalData: Float32Array<ArrayBuffer> | null = null;
    private _thematicData: Float32Array<ArrayBuffer> | null = null;
    private _thematicValidityData: Float32Array<ArrayBuffer> | null = null;
    private _highlightedData: Float32Array<ArrayBuffer> | null = null;
    private _skippedData: Float32Array<ArrayBuffer> | null = null;
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    override destroy(): void {
        this._positionBuffer?.destroy();
        this._normalBuffer?.destroy();
        this._thematicBuffer?.destroy();
        this._thematicValidityBuffer?.destroy();
        this._highlightedBuffer?.destroy();
        this._skippedBuffer?.destroy();
        this._indicesBuffer?.destroy();
        super.destroy();
    }

    static beginSharedGeometryPass(renderer: Renderer): GPURenderPassEncoder {
        const shared = this._ensureSharedState(renderer);
        shared.colorsSharedBuffer.loadOp = 'clear';
        shared.normalsSharedBuffer.loadOp = 'clear';
        shared.depthBufferPass01.depthLoadOp = 'clear';

        return renderer.commandEncoder.beginRenderPass({
            colorAttachments: [shared.colorsSharedBuffer, shared.normalsSharedBuffer],
            depthStencilAttachment: shared.depthBufferPass01,
        });
    }

    static compositeSharedPass(renderer: Renderer, passEncoder: GPURenderPassEncoder): void {
        const shared = this._ensureSharedState(renderer);
        passEncoder.setPipeline(shared.pipeline02);
        passEncoder.setBindGroup(0, shared.texturesPass02BindGroup);
        passEncoder.draw(6);
    }

    build(mesh: Triangles3DLayer): void {
        this.createShaders();
        this.createVertexBuffers(mesh);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();
        this.updateVertexBuffers(mesh);
        this.updateColorUniforms(mesh);
        this.createPipeline01();
        PipelineBuildingSSAO._ensureSharedState(this._renderer);
    }

    createShaders(): void {
        this._vertModule01 = this._renderer.device.createShaderModule({
            label: 'Buildings ssao: vertex shader pass 01',
            code: buildingsVS01,
        });
        this._fragModule01 = this._renderer.device.createShaderModule({
            label: 'Buildings ssao: fragment shader pass 01',
            code: buildingsFS01,
        });
    }

    createVertexBuffers(mesh: Triangles3DLayer): void {
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._normalBuffer = this._renderer.device.createBuffer({
            label: 'Normal buffer',
            size: mesh.normal.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._thematicBuffer = this._renderer.device.createBuffer({
            label: 'Thematic data buffer',
            size: mesh.thematic.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._thematicValidityBuffer = this._renderer.device.createBuffer({
            label: 'Thematic validity buffer',
            size: mesh.thematicValidity.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._highlightedBuffer = this._renderer.device.createBuffer({
            label: 'Highlighted data buffer',
            size: mesh.highlightedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._skippedBuffer = this._renderer.device.createBuffer({
            label: 'Skipped data buffer',
            size: mesh.skippedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(mesh: Triangles3DLayer): void {
        this._normalData = this._syncFloatData(this._normalData, mesh.normal);
        this._thematicData = this._syncFloatData(this._thematicData, mesh.thematic);
        this._thematicValidityData = this._syncFloatData(this._thematicValidityData, mesh.thematicValidity);
        this._highlightedData = this._syncFloatData(this._highlightedData, mesh.highlightedVertices);
        this._skippedData = this._syncFloatData(this._skippedData, mesh.skippedVertices);
        this._positionData = this._syncFloatData(this._positionData, mesh.position);
        this._indicesData = this._syncUintData(this._indicesData, mesh.indices);

        this._renderer.device.queue.writeBuffer(this._normalBuffer, 0, this._normalData);
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, this._thematicData);
        this._renderer.device.queue.writeBuffer(this._thematicValidityBuffer, 0, this._thematicValidityData);
        this._renderer.device.queue.writeBuffer(this._highlightedBuffer, 0, this._highlightedData);
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, this._skippedData);
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
    }

    createPipeline01(): void {
        const positionAttribDesc: GPUVertexAttribute = { shaderLocation: 0, offset: 0, format: 'float32x3' };
        const normalAttribDesc: GPUVertexAttribute = { shaderLocation: 1, offset: 0, format: 'float32x3' };
        const thematicAttribDesc: GPUVertexAttribute = { shaderLocation: 2, offset: 0, format: 'float32' };
        const highlightedAttribDesc: GPUVertexAttribute = { shaderLocation: 3, offset: 0, format: 'float32' };
        const thematicValidityAttribDesc: GPUVertexAttribute = { shaderLocation: 4, offset: 0, format: 'float32' };
        const skippedAttribDesc: GPUVertexAttribute = { shaderLocation: 5, offset: 0, format: 'float32' };

        const vertex: GPUVertexState = {
            module: this._vertModule01,
            entryPoint: 'main',
            buffers: [
                { attributes: [positionAttribDesc], arrayStride: 4 * 3, stepMode: 'vertex' },
                { attributes: [normalAttribDesc], arrayStride: 4 * 3, stepMode: 'vertex' },
                { attributes: [thematicAttribDesc], arrayStride: 4, stepMode: 'vertex' },
                { attributes: [highlightedAttribDesc], arrayStride: 4, stepMode: 'vertex' },
                { attributes: [thematicValidityAttribDesc], arrayStride: 4, stepMode: 'vertex' },
                { attributes: [skippedAttribDesc], arrayStride: 4, stepMode: 'vertex' },
            ],
        };
        const fragment: GPUFragmentState = {
            module: this._fragModule01,
            entryPoint: 'main',
            targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }],
        };
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list',
        };
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'greater-equal',
            format: 'depth32float',
        };
        const layout = this._renderer.device.createPipelineLayout({
            bindGroupLayouts: [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout],
        });

        this._pipeline01 = this._renderer.device.createRenderPipeline({
            layout,
            vertex,
            fragment,
            primitive,
            depthStencil,
            label: 'Pipeline triangle ssao 01',
        });
    }

    renderGeometryPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        passEncoder.setPipeline(this._pipeline01);
        this.updateCameraUniforms(camera);
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._normalBuffer);
        passEncoder.setVertexBuffer(2, this._thematicBuffer);
        passEncoder.setVertexBuffer(3, this._highlightedBuffer);
        passEncoder.setVertexBuffer(4, this._thematicValidityBuffer);
        passEncoder.setVertexBuffer(5, this._skippedBuffer);
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) {
            passEncoder.drawIndexed(indexCount);
        }
    }

    override prepareRender(_camera: Camera): void {}

    renderPass(_camera: Camera, _passEncoder: GPURenderPassEncoder): void {}

    private static _ensureSharedState(renderer: Renderer): SharedSsaoState {
        const width = 2 * renderer.pixelWidth;
        const height = 2 * renderer.pixelHeight;
        const existing = this._sharedState.get(renderer);
        if (existing && existing.width === width && existing.height === height) {
            return existing;
        }

        existing?.colorsSharedTexture.destroy();
        existing?.normalsSharedTexture.destroy();
        existing?.depthTexturePass01.destroy();

        const colorsSharedTexture = renderer.device.createTexture({
            label: 'Shared colors texture',
            size: [width, height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });
        const normalsSharedTexture = renderer.device.createTexture({
            label: 'Shared normals texture',
            size: [width, height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });
        const depthTexturePass01 = renderer.device.createTexture({
            label: 'Shared building depth texture',
            size: [width, height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        const colorsSharedBuffer: GPURenderPassColorAttachment = {
            view: colorsSharedTexture.createView(),
            clearValue: [0.0, 0.0, 0.0, 0.0],
            loadOp: 'clear',
            storeOp: 'store',
        };
        const normalsSharedBuffer: GPURenderPassColorAttachment = {
            view: normalsSharedTexture.createView(),
            clearValue: [0.0, 0.0, 0.0, 0.0],
            loadOp: 'clear',
            storeOp: 'store',
        };
        const depthBufferPass01: GPURenderPassDepthStencilAttachment = {
            view: depthTexturePass01.createView(),
            depthClearValue: 0.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };

        const texSampler = renderer.device.createSampler({
            label: 'Shared building pass 02 sampler',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
        const texturesPass02BindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            ],
        });
        const texturesPass02BindGroup = renderer.device.createBindGroup({
            layout: texturesPass02BindGroupLayout,
            entries: [
                { binding: 0, resource: texSampler },
                { binding: 1, resource: colorsSharedBuffer.view },
                { binding: 2, resource: normalsSharedBuffer.view },
            ],
        });

        const vertModule02 = renderer.device.createShaderModule({
            label: 'Buildings ssao: vertex shader pass 02',
            code: buildingsVS02,
        });
        const fragModule02 = renderer.device.createShaderModule({
            label: 'Buildings ssao: fragment shader pass 02',
            code: buildingsFS02,
        });
        const pipeline02 = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [texturesPass02BindGroupLayout],
            }),
            vertex: {
                module: vertModule02,
                entryPoint: 'main',
            },
            fragment: {
                module: fragModule02,
                entryPoint: 'main',
                targets: [{
                    format: renderer.canvasFormat,
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-strip',
                stripIndexFormat: 'uint32',
            },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'greater-equal',
                format: 'depth32float',
            },
            multisample: {
                count: renderer.sampleCount,
            },
            label: 'Pipeline triangle ssao 02 shared',
        });

        const state: SharedSsaoState = {
            colorsSharedBuffer,
            normalsSharedBuffer,
            depthBufferPass01,
            colorsSharedTexture,
            normalsSharedTexture,
            depthTexturePass01,
            texturesPass02BindGroup,
            texturesPass02BindGroupLayout,
            pipeline02,
            width,
            height,
        };
        this._sharedState.set(renderer, state);
        return state;
    }
}
