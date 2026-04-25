/**
 * @module PipelineTriangleRaster
 * WebGPU raster-triangle rendering pipeline.
 *
 * This module defines the `PipelineTriangleRaster` class, a concrete pipeline
 * implementation used by raster-backed layers. It owns the GPU buffers,
 * texture resources, bind groups, shader modules, and render pipeline state
 * required to draw indexed 2D triangles textured with RGBA raster data.
 */

/// <reference types="@webgpu/types" />

import rasterVertexSource from './shaders/raster.vert.wgsl';
import rasterFragmentSource from './shaders/raster.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './types-core';

import { RasterLayer } from './layer-raster';

/**
 * Raster-triangle pipeline for rendering textured 2D raster surfaces.
 *
 * `PipelineTriangleRaster` uploads flattened triangle geometry, texture
 * coordinates, and raster texture data from a `RasterLayer`, then renders the
 * result using a dedicated vertex/fragment shader pair. It also coordinates the
 * shared camera and render-info uniform bindings inherited from `Pipeline`.
 *
 * @example
 * const pipeline = new PipelineTriangleRaster(renderer);
 * pipeline.build(rasterLayer);
 */
export class PipelineTriangleRaster extends Pipeline {
    /** Vertex buffer storing 2D raster triangle positions. */
    protected _positionBuffer!: GPUBuffer;

    /** Vertex buffer storing texture coordinates aligned with raster vertices. */
    protected _texCoordBuffer!: GPUBuffer;

    /** Index buffer describing raster triangles. */
    protected _indicesBuffer!: GPUBuffer;

    /** Compiled vertex shader module for raster geometry. */
    protected _vertModule!: GPUShaderModule;

    /** Compiled fragment shader module for raster sampling. */
    protected _fragModule!: GPUShaderModule;

    /** Render pipeline used for raster triangle draw passes. */
    protected _pipeline!: GPURenderPipeline;

    /** Texture resource containing the layer's RGBA raster payload. */
    protected _rasterBuffer!: GPUTexture;
    /** Bind group that exposes the raster texture and sampler to the fragment shader. */
    protected _rasterBindGroup!: GPUBindGroup;

    /** Bind group layout for raster texture sampling resources. */
    protected _rasterBindGroupLayout!: GPUBindGroupLayout;

    /** Reused CPU-side upload buffer for vertex positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for texture coordinates. */
    private _texCoordData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for triangle indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload payload for RGBA raster texture data. */
    private _rasterTextureData: Uint8Array<ArrayBuffer> | null = null;

    /**
     * Creates a raster-triangle pipeline bound to a renderer.
     *
     * The renderer provides the WebGPU device, target format, and shared render
     * settings used by all resources created by this pipeline.
     *
     * @param renderer Renderer that owns the WebGPU device and canvas state.
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Releases GPU resources owned by this pipeline.
     *
     * This destroys the geometry buffers and raster texture created by this
     * pipeline, then delegates to the base pipeline to release shared uniform
     * resources.
     *
     * @returns Nothing. This pipeline's GPU allocations are destroyed in place.
     */
    override destroy(): void {
        this._positionBuffer?.destroy();
        this._texCoordBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._rasterBuffer?.destroy();
        super.destroy();
    }

    /**
     * Builds all GPU resources needed to render a raster layer.
     *
     * This initializes shader modules, geometry buffers, raster texture
     * bindings, shared render-info bindings, camera bindings, and the final
     * render pipeline. It also uploads the layer's current geometry, render
     * state, and raster payload before the first draw.
     *
     * @param mesh Raster layer supplying triangle geometry, texture
     * coordinates, render configuration, and raster texture data.
     * @returns Nothing. The pipeline becomes ready for use in render passes.
     */
    build(mesh: RasterLayer): void {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createRasterUniformBindGroup(mesh);

        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(mesh);
        this.updateColorUniforms(mesh);
        this.updateRasterUniforms(mesh);

        this.createPipeline();
    }

    /**
     * Creates the shader modules used by the raster pipeline.
     *
     * The compiled modules are later referenced when the render pipeline is
     * created.
     *
     * @returns Nothing. Shader modules are created and stored on the instance.
     */
    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: rasterVertexSource,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: rasterFragmentSource,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Creates GPU buffers for raster geometry uploads.
     *
     * Buffer sizes are derived directly from the current layer geometry. This
     * method allocates buffers only; it does not upload any geometry data.
     *
     * @param raster Raster layer whose position, texture-coordinate, and index
     * arrays determine the required buffer sizes.
     * @returns Nothing. Empty GPU buffers are allocated for later uploads.
     */
    override createVertexBuffers(raster: RasterLayer): void {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: raster.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // texture coordinates data
        this._texCoordBuffer = this._renderer.device.createBuffer({
            label: 'Texture coordinates buffer',
            size: raster.texCoord.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: raster.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Uploads raster geometry data into the existing GPU buffers.
     *
     * The method reuses cached typed arrays when possible to avoid repeated CPU
     * allocations during updates.
     *
     * @param mesh Raster layer supplying the latest position,
     * texture-coordinate, and index data.
     * @returns Nothing. The GPU geometry buffers are overwritten in place.
     */
    override updateVertexBuffers(mesh: RasterLayer): void {
        this._positionData = this._syncFloatData(this._positionData, mesh.position);
        this._texCoordData = this._syncFloatData(this._texCoordData, mesh.texCoord);
        this._indicesData = this._syncUintData(this._indicesData, mesh.indices);

        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        this._renderer.device.queue.writeBuffer(this._texCoordBuffer, 0, this._texCoordData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
    }

    /**
     * Creates the raster texture, sampler, and bind group used for sampling.
     *
     * The texture dimensions are taken from the layer's raster resolution and
     * the bind group is configured for fragment-stage access.
     *
     * @param raster Raster layer providing the raster texture resolution.
     * @returns Nothing. Raster sampling resources are allocated and bound.
     */
    createRasterUniformBindGroup(raster: RasterLayer): void {
        this._rasterBuffer = this._renderer.device.createTexture({
            label: 'Raster texture',
            size: { width: raster.rasterResX, height: raster.rasterResY },
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba8unorm',
        });

        const rasterSampler = this._renderer.device.createSampler({
            label: 'Raster sampler',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });

        // Raster uniform bind group layout
        this._rasterBindGroupLayout = this._renderer.device.createBindGroupLayout({
            label: 'Raster bind group layout',
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });

        // Raster uniform bind group
        this._rasterBindGroup = this._renderer.device.createBindGroup({
            layout: this._rasterBindGroupLayout,
            label: 'Raster bind group',
            entries: [
                {
                    binding: 0,
                    resource: this._rasterBuffer.createView(),
                },
                {
                    binding: 1,
                    resource: rasterSampler,
                },
            ],
        });
    }

    /**
     * Uploads RGBA raster data into the raster texture.
     *
     * Calls with a missing or empty raster payload are ignored. The upload uses
     * the layer's current raster resolution to define texture copy dimensions.
     *
     * @param raster Raster layer containing the RGBA raster payload and texture
     * dimensions.
     * @returns Nothing. The raster texture is updated when data are available.
     */
    updateRasterUniforms(raster: RasterLayer): void {
        if (!raster.rasterData || raster.rasterData.length === 0) { return; }

        this._rasterTextureData = this._syncU8Data(this._rasterTextureData, raster.rasterData);

        this._renderer.device.queue.writeTexture(
            { texture: this._rasterBuffer },
            this._rasterTextureData,
            {
                bytesPerRow: raster.rasterResX * 4,
                rowsPerImage: raster.rasterResY,
            },
            { width: raster.rasterResX, height: raster.rasterResY },
        );
    }

    /**
     * Creates the WebGPU render pipeline for raster triangle drawing.
     *
     * The pipeline combines raster vertex inputs, alpha blending, depth
     * testing, multisampling, and the shared render-info, camera, and raster
     * sampling bind-group layouts.
     *
     * @returns Nothing. The render pipeline is created and stored on the instance.
     */
    createPipeline(): void {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x2',
        };

        // Vertex data
        const texCoordAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32x2',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 2, // sizeof(float) * 2
            stepMode: 'vertex',
        };

        const texCoordBufferDesc: GPUVertexBufferLayout = {
            attributes: [texCoordAttribDesc],
            arrayStride: 4 * 2, // sizeof(float) * 2
            stepMode: 'vertex',
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, texCoordBufferDesc],
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule,
            entryPoint: 'main',
            targets: [
                {
                    format: this._renderer.canvasFormat,
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha'
                        },
                    },
                },
            ],
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list',
        };

        // Antialising
        const multisample: GPUMultisampleState = {
            count: this._renderer.sampleCount,
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: false,
            depthCompare: 'greater-equal',
            format: 'depth32float',
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout, this._rasterBindGroupLayout],
        };

        // Pipeline
        const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout,
            vertex,
            fragment,
            primitive,
            depthStencil,
            multisample,
            label: 'Pipeline Raster',
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Encodes a raster draw pass into the provided render pass encoder.
     *
     * This updates camera uniforms for the current view, binds the geometry and
     * raster resources created by `build`, and issues an indexed draw call only
     * when the index buffer contains at least one triangle.
     *
     * @param camera Camera whose matrices are uploaded before drawing.
     * @param passEncoder Active render pass encoder that receives the draw commands.
     * @returns Nothing. Draw commands are appended to the render pass when indices are present.
     */
    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline);

        // updates camera
        this.updateCameraUniforms(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._texCoordBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);
        passEncoder.setBindGroup(2, this._rasterBindGroup);

        // draw command
        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) { passEncoder.drawIndexed(indexCount); }
    }

}
