/**
 * @module PipelineBuildingSSAO
 * WebGPU pipeline for rendering building geometry with a shared SSAO pass.
 *
 * This module defines the `PipelineBuildingSSAO` class, which builds the
 * geometry pass for indexed 3D building meshes and the renderer-scoped shared
 * resources used by the SSAO composite pass. It owns the per-instance vertex
 * and index buffers, uploads mesh data into those buffers, and coordinates the
 * two-pass render flow through shared offscreen textures and a fullscreen
 * composite pipeline.
 */

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
 *
 * `PipelineBuildingSSAO` renders indexed building meshes in an offscreen
 * geometry pass, stores color and normal outputs in renderer-scoped shared
 * textures, and exposes helpers for the fullscreen SSAO composite pass. The
 * class manages mesh-specific GPU buffers and shader state, while shared
 * textures, sampler state, and the composite pipeline are cached per renderer.
 *
 * @example
 * const pipeline = new PipelineBuildingSSAO(renderer);
 * pipeline.build(buildingMesh);
 */
export class PipelineBuildingSSAO extends Pipeline {
    /** Renderer-scoped shared SSAO state cache. */
    private static _sharedState = new WeakMap<Renderer, SharedSsaoState>();

    /** GPU vertex buffer containing building positions. */
    protected _positionBuffer!: GPUBuffer;
    /** GPU vertex buffer containing building normals. */
    protected _normalBuffer!: GPUBuffer;
    /** GPU vertex buffer containing thematic values. */
    protected _thematicBuffer!: GPUBuffer;
    /** GPU vertex buffer containing thematic validity flags. */
    protected _thematicValidityBuffer!: GPUBuffer;
    /** GPU vertex buffer containing highlighted-vertex flags. */
    protected _highlightedBuffer!: GPUBuffer;
    /** GPU vertex buffer containing skipped-vertex flags. */
    protected _skippedBuffer!: GPUBuffer;
    /** GPU index buffer defining building triangles. */
    protected _indicesBuffer!: GPUBuffer;

    /** Compiled vertex shader module for the geometry pass. */
    protected _vertModule01!: GPUShaderModule;
    /** Compiled fragment shader module for the geometry pass. */
    protected _fragModule01!: GPUShaderModule;
    /** Render pipeline used for the geometry pass. */
    protected _pipeline01!: GPURenderPipeline;

    /** Reused CPU-side upload buffer for positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for normals. */
    private _normalData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for thematic values. */
    private _thematicData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for thematic validity flags. */
    private _thematicValidityData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for highlight flags. */
    private _highlightedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for skip flags. */
    private _skippedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for triangle indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;

    /**
     * Creates a building SSAO pipeline bound to a renderer.
     *
     * The renderer provides the WebGPU device, canvas format, multisampling
     * configuration, and shared state used to build the geometry and composite
     * passes.
     *
     * @param renderer Renderer that owns the WebGPU device and canvas state.
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Releases GPU resources owned by this pipeline.
     *
     * This destroys the geometry buffers created by the pipeline and then
     * delegates to the base pipeline for shared cleanup.
     *
     * @returns Releases this pipeline's GPU allocations in place.
     */
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

    /**
     * Begins the shared geometry pass for all SSAO-enabled building layers.
     *
     * The pass writes color, normals, and depth into renderer-scoped offscreen
     * textures. Those attachments are cleared before each use so callers can
     * record one or more geometry draw calls into the returned encoder.
     *
     * @param renderer Renderer that owns the shared SSAO targets.
     * @returns Render pass encoder targeting the shared geometry buffers.
     */
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

    /**
     * Draws the shared fullscreen SSAO composite pass.
     *
     * The pass samples the shared color and normal textures generated by the
     * geometry pass and renders the composited result into the caller-provided
     * pass encoder.
     *
     * @param renderer Renderer that owns the shared SSAO textures and pipeline.
     * @param passEncoder Active render pass encoder for the final composite.
     * @returns Records a fullscreen draw into the provided render pass.
     */
    static compositeSharedPass(renderer: Renderer, passEncoder: GPURenderPassEncoder): void {
        const shared = this._ensureSharedState(renderer);
        passEncoder.setPipeline(shared.pipeline02);
        passEncoder.setBindGroup(0, shared.texturesPass02BindGroup);
        passEncoder.draw(6);
    }

    /**
     * Builds the SSAO geometry and shared composite resources for a mesh.
     *
     * This creates shader modules, allocates and uploads per-mesh buffers,
     * prepares the base pipeline bind groups, initializes the geometry render
     * pipeline, and ensures that the renderer-scoped shared SSAO state exists.
     *
     * @param mesh Building mesh whose typed arrays provide geometry and render
     * state for the pass.
     * @returns Initializes this pipeline for subsequent render passes.
     */
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

    /**
     * Creates the shader modules used by the geometry pass.
     *
     * The modules are compiled from the WGSL sources imported for the building
     * SSAO geometry stage.
     *
     * @returns Creates and stores the compiled shader modules on the pipeline.
     */
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

    /**
     * Allocates GPU buffers sized for the current building mesh.
     *
     * Buffer sizes are derived from the current typed-array lengths on the mesh.
     * This method allocates buffers only; data upload happens in
     * {@link updateVertexBuffers}.
     *
     * @param mesh Building mesh whose typed-array lengths determine buffer sizes.
     * @returns Creates GPU buffers for all geometry attributes and indices.
     */
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

    /**
     * Uploads the current mesh data into the pipeline's GPU buffers.
     *
     * The method reuses cached CPU-side typed arrays when possible and writes
     * the synchronized data into the corresponding GPU buffers.
     *
     * @param mesh Building mesh providing the latest position, normal,
     * thematic, highlight, skip, and index arrays.
     * @returns Updates the GPU buffer contents in place.
     */
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

    /**
     * Creates the geometry render pipeline for the building SSAO pass.
     *
     * The pipeline writes color and normal outputs to the shared offscreen
     * textures used by the SSAO composite stage, and uses the base pipeline's
     * render-info and camera bind group layouts.
     *
     * @returns Creates and stores the geometry render pipeline on the instance.
     */
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

    /**
     * Records the indexed geometry draw calls for the building pass.
     *
     * This binds the geometry pipeline, uploads the latest camera uniforms,
     * binds the vertex and index buffers, and skips the draw when the mesh has
     * no indices.
     *
     * @param camera Camera used to update the shared camera uniforms.
     * @param passEncoder Active render pass encoder for the geometry pass.
     * @returns Records indexed geometry draws into the provided render pass.
     */
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

    /**
     * No-op preparation hook for this pipeline's render flow.
     *
     * The SSAO pipeline is driven through the shared geometry and composite
     * helpers instead of the base pipeline's per-layer render preparation.
     *
     * @returns Intentionally performs no per-frame preparation.
     */
    override prepareRender(_camera: Camera): void {}

    /**
     * No-op render hook for this pipeline's render flow.
     *
     * The SSAO pipeline records work through {@link renderGeometryPass} and the
     * static shared pass helpers rather than this base render entry point.
     *
     * @returns Intentionally performs no draw work.
     */
    renderPass(_camera: Camera, _passEncoder: GPURenderPassEncoder): void {}

    /**
     * Returns the renderer-scoped shared SSAO resources, recreating them when
     * the render target size changes.
     *
     * Shared textures are sized at twice the renderer's pixel dimensions and
     * cached per renderer. When the size changes, the previous textures are
     * destroyed and a new geometry/composite state bundle is created.
     *
     * @param renderer Renderer that owns the shared SSAO state.
     * @returns Shared SSAO attachments, bind groups, and composite pipeline.
     */
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
