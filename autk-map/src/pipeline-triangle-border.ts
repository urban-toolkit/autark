/**
 * @module PipelineTriangleBorder
 * WebGPU line pipeline for rendering 2D triangle borders.
 *
 * This module defines {@link PipelineTriangleBorder}, a specialized rendering
 * pipeline used by triangle-based 2D layers to draw border edges. The pipeline
 * manages shader creation, GPU buffer allocation and uploads, uniform bind
 * groups inherited from the base pipeline, and indexed line-list draw calls.
 */

/// <reference types="@webgpu/types" />

import linesVertexSource from './shaders/triangle-02.vert.wgsl';
import linesFragmentSource from './shaders/triangle-02.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './types-core';

import { Triangles2DLayer } from './layer-triangles2D';

/**
 * Rendering pipeline for drawing 2D triangle borders as indexed lines.
 *
 * `PipelineTriangleBorder` uploads border vertex positions, edge indices, and
 * per-vertex skipped flags from a {@link Triangles2DLayer}, then renders them
 * with a dedicated WebGPU line-list pipeline. It relies on the base
 * {@link Pipeline} implementation for shared camera and render-info uniform
 * management.
 */
export class PipelineTriangleBorder extends Pipeline {
    /** GPU vertex buffer containing border positions. */
    protected _positionBuffer!: GPUBuffer;

    /** GPU index buffer describing border line segments. */
    protected _borderIndicesBuffer!: GPUBuffer;

    /** GPU vertex buffer containing per-vertex skipped flags. */
    protected _skippedBuffer!: GPUBuffer;

    /** Compiled vertex shader module for border rendering. */
    protected _vertModule!: GPUShaderModule;

    /** Compiled fragment shader module for border rendering. */
    protected _fragModule!: GPUShaderModule;

    /** WebGPU render pipeline used for indexed border draw calls. */
    protected _pipeline!: GPURenderPipeline;

    /** Reused CPU-side upload buffer for border positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for border indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for skipped flags. */
    private _skippedData: Float32Array<ArrayBuffer> | null = null;

    /**
     * Creates a triangle-border pipeline bound to a renderer.
     *
     * The renderer provides the GPU device, canvas format, sample count, and
     * shared rendering state required to allocate buffers and create the render
     * pipeline.
     *
     * @param renderer Renderer that owns the WebGPU device and render targets.
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Releases GPU resources owned by this pipeline.
     *
     * @returns Destroys this pipeline's buffers, then delegates to the base
     * pipeline to release shared resources such as uniform buffers and bind
     * groups.
     */
    override destroy(): void {
        this._positionBuffer?.destroy();
        this._borderIndicesBuffer?.destroy();
        this._skippedBuffer?.destroy();
        super.destroy();
    }

    /**
     * Builds GPU resources and uploads layer data for border rendering.
     *
     * This method creates shader modules, allocates vertex and index buffers,
     * initializes shared uniform bind groups, uploads the current layer data,
     * and creates the WebGPU render pipeline. It is expected to be called
     * before the first render pass for the layer.
     *
     * @param borders Triangle layer supplying border positions, edge indices,
     * and skipped-vertex flags.
     * @returns Initializes this pipeline instance for subsequent draw calls.
     */
    build(borders: Triangles2DLayer): void {
        this.createShaders();

        this.createVertexBuffers(borders);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(borders);
        this.updateColorUniforms(borders);

        this.createPipeline();
    }

    /**
     * Creates the shader modules used by the border pipeline.
     *
     * @returns Compiles the WGSL vertex and fragment shader sources into GPU
     * shader modules stored on this instance.
     */
    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: linesVertexSource,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: linesFragmentSource,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Allocates GPU buffers sized for the current border data.
     *
     * Buffer sizes are derived directly from the current layer arrays. If the
     * layer data changes size later, callers must ensure buffers are recreated
     * before uploading larger payloads.
     *
     * @param borders Triangle layer supplying the border arrays used to size
     * the position, index, and skipped buffers.
     * @returns Creates GPU buffers for subsequent uploads and draw calls.
     */
    createVertexBuffers(borders: Triangles2DLayer): void {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: borders.borderPosition.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._borderIndicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: borders.borderIndices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._skippedBuffer = this._renderer.device.createBuffer({
            label: 'Skipped data buffer',
            size: borders.skippedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Uploads the current border arrays into the pipeline's GPU buffers.
     *
     * The method reuses cached typed arrays when possible via base-pipeline
     * synchronization helpers, then writes the synchronized data to the GPU
     * queue for the position, index, and skipped buffers.
     *
     * @param borders Triangle layer supplying border positions, edge indices,
     * and skipped-vertex flags.
     * @returns Updates the GPU-side buffer contents used by rendering.
     */
    updateVertexBuffers(borders: Triangles2DLayer): void {
        this._positionData = this._syncFloatData(this._positionData, borders.borderPosition);
        this._indicesData = this._syncUintData(this._indicesData, borders.borderIndices);
        this._skippedData = this._syncFloatData(this._skippedData, borders.skippedVertices);

        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        this._renderer.device.queue.writeBuffer(this._borderIndicesBuffer, 0, this._indicesData);
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, this._skippedData);
    }

    /**
     * Creates the WebGPU render pipeline used to draw borders.
     *
     * The pipeline renders indexed `line-list` primitives, uses the renderer's
     * multisample configuration, disables depth writes while still participating
     * in depth testing, and binds the shared render-info and camera uniform
     * layouts inherited from the base pipeline.
     *
     * @returns Stores the created render pipeline on this instance.
     */
    createPipeline(): void {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x2',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 2, // sizeof(float) * 2
            stepMode: 'vertex',
        };

        const skippedAttribDesc: GPUVertexAttribute = {
            shaderLocation: 3, // [[location(3)]]
            offset: 0,
            format: 'float32',
        };

        const skippedBufferDesc: GPUVertexBufferLayout = {
            attributes: [skippedAttribDesc],
            arrayStride: 4 * 1, // sizeof(float) * 3
            stepMode: 'vertex',
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, skippedBufferDesc],
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
            topology: 'line-list'
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
            bindGroupLayouts: [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout],
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
            label: 'Pipeline border flat',
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Encodes a render pass for the current triangle borders.
     *
     * The method updates camera uniforms for the current frame, binds the
     * pipeline, vertex buffers, index buffer, and uniform bind groups, then
     * issues an indexed draw only when the border index buffer contains at
     * least one index.
     *
     * @param camera Camera whose current view and projection state should be
     * uploaded before drawing.
     * @param passEncoder Active render-pass encoder that receives the draw
     * commands.
     * @returns Encodes draw commands into the provided render pass when border
     * indices are available; otherwise, no draw call is issued.
     */
    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline);

        // updates camera
        this.updateCameraUniforms(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._skippedBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._borderIndicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        const indexCount = this._borderIndicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) { passEncoder.drawIndexed(indexCount); }
    }

}
