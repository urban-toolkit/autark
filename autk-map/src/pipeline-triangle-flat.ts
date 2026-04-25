/**
 * @module PipelineTriangleFlat
 * WebGPU pipeline for rendering flat indexed triangle geometry.
 *
 * This module defines the `PipelineTriangleFlat` class, a vector-layer render
 * pipeline that uploads per-vertex position, thematic, validity, highlight,
 * and skip state into GPU buffers and draws them with a triangle-list render
 * pipeline. It works with `VectorLayer` mesh data and integrates shared camera
 * and render-info uniform bind groups provided by the base `Pipeline` class.
 */

/// <reference types="@webgpu/types" />

import trianglesVertexSource from './shaders/triangle-01.vert.wgsl';
import trianglesFragmentSource from './shaders/triangle-01.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './types-core';

import { VectorLayer } from './layer-vector';

/**
 * Renders flat indexed triangles for a vector layer.
 *
 * `PipelineTriangleFlat` owns the GPU resources needed to draw triangle meshes
 * whose vertex data is supplied by a `VectorLayer`. It creates shader modules,
 * allocates and updates vertex and index buffers, binds shared render-info and
 * camera uniforms from the base pipeline, and records indexed draw calls for
 * the current render pass.
 */
export class PipelineTriangleFlat extends Pipeline {
    /** GPU vertex buffer containing 2D positions. */
    protected _positionBuffer!: GPUBuffer;

    /** GPU vertex buffer containing per-vertex thematic values. */
    protected _thematicBuffer!: GPUBuffer;
    /** GPU vertex buffer containing per-vertex thematic validity flags. */
    protected _thematicValidityBuffer!: GPUBuffer;

    /** GPU vertex buffer containing per-vertex highlight flags. */
    protected _highlightedBuffer!: GPUBuffer;

    /** GPU vertex buffer containing per-vertex skip flags. */
    protected _skippedBuffer!: GPUBuffer;

    /** GPU index buffer defining triangle primitives. */
    protected _indicesBuffer!: GPUBuffer;

    /** Compiled vertex shader module for triangle rendering. */
    protected _vertModule!: GPUShaderModule;

    /** Compiled fragment shader module for triangle rendering. */
    protected _fragModule!: GPUShaderModule;

    /** WebGPU render pipeline used for indexed triangle draws. */
    protected _pipeline!: GPURenderPipeline;

    /** Reused CPU-side upload buffer for positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for thematic values. */
    private _thematicData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for thematic validity flags. */
    private _thematicValidityData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for highlighted flags. */
    private _highlightedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for skipped flags. */
    private _skippedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for triangle indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;

    /**
     * Creates a flat-triangle pipeline bound to a renderer.
     *
     * The renderer provides the WebGPU device, canvas format, multisampling
     * configuration, and shared resources required to create pipeline state and
     * upload buffers.
     *
     * @param renderer Renderer that owns the WebGPU device and render context.
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Releases GPU resources owned by this pipeline.
     *
     * This destroys all vertex and index buffers created by the pipeline and
     * then delegates to the base pipeline to release shared resources.
     *
     * @returns Releases this pipeline's GPU allocations in place.
     */
    override destroy(): void {
        this._positionBuffer?.destroy();
        this._thematicBuffer?.destroy();
        this._thematicValidityBuffer?.destroy();
        this._highlightedBuffer?.destroy();
        this._skippedBuffer?.destroy();
        this._indicesBuffer?.destroy();
        super.destroy();
    }

    /**
     * Builds all GPU resources needed to render a vector-layer triangle mesh.
     *
     * This method creates shader modules, allocates vertex and index buffers,
     * initializes the shared color and camera uniform bind groups inherited from
     * `Pipeline`, uploads the current mesh data, updates render-info uniforms,
     * and finally creates the render pipeline state.
     *
     * @param mesh Vector layer whose typed arrays provide positions, thematic
     * values, thematic validity flags, highlight flags, skip flags, and
     * triangle indices.
     * @returns Initializes this pipeline for subsequent render passes.
     */
    build(mesh: VectorLayer): void {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(mesh);
        this.updateColorUniforms(mesh);

        this.createPipeline();
    }

    /**
     * Creates the shader modules used by this pipeline.
     *
     * The modules are compiled from the flat-triangle WGSL vertex and fragment
     * shader sources imported by this module.
     *
     * @returns Creates and stores the compiled shader modules on the pipeline.
     */
    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: trianglesVertexSource,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: trianglesFragmentSource,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Allocates GPU vertex and index buffers sized for the current mesh.
     *
     * Buffer sizes are derived directly from the current lengths of the mesh's
     * typed arrays. The buffers are created with copy destinations so their
     * contents can be uploaded later by {@link updateVertexBuffers}.
     *
     * @param mesh Vector layer whose typed-array lengths determine buffer sizes.
     * @returns Creates GPU buffers for all per-vertex attributes and indices.
     */
    createVertexBuffers(mesh: VectorLayer): void {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
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

        // vertex data
        this._highlightedBuffer = this._renderer.device.createBuffer({
            label: 'Highlighted data buffer',
            size: mesh.highlightedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._skippedBuffer = this._renderer.device.createBuffer({
            label: 'Skipped data buffer',
            size: mesh.skippedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Uploads the current mesh data into the pipeline's GPU buffers.
     *
     * This method reuses cached CPU-side typed arrays when possible via the
     * base pipeline sync helpers, then writes the synchronized data into the
     * corresponding GPU buffers. It assumes the buffers have already been
     * created with sizes compatible with the current mesh data.
     *
     * @param mesh Vector layer providing the latest position, thematic,
     * thematic-validity, highlight, skip, and index arrays.
     * @returns Updates the GPU buffer contents in place.
     */
    updateVertexBuffers(mesh: VectorLayer): void {
        this._positionData = this._syncFloatData(this._positionData, mesh.position);
        this._thematicData = this._syncFloatData(this._thematicData, mesh.thematic);
        this._thematicValidityData = this._syncFloatData(this._thematicValidityData, mesh.thematicValidity);
        this._highlightedData = this._syncFloatData(this._highlightedData, mesh.highlightedVertices);
        this._skippedData = this._syncFloatData(this._skippedData, mesh.skippedVertices);
        this._indicesData = this._syncUintData(this._indicesData, mesh.indices);

        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, this._thematicData);
        this._renderer.device.queue.writeBuffer(this._thematicValidityBuffer, 0, this._thematicValidityData);
        this._renderer.device.queue.writeBuffer(this._highlightedBuffer, 0, this._highlightedData);
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, this._skippedData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);
    }

    /**
     * Creates the WebGPU render pipeline used to draw the triangle mesh.
     *
     * The pipeline defines the vertex buffer layouts expected by the shaders,
     * configures alpha blending, uses a triangle-list primitive topology, and
     * binds the render-info and camera uniform group layouts inherited from the
     * base pipeline.
     *
     * @returns Creates and stores the render pipeline state object.
     */
    createPipeline(): void {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x2',
        };
        const thematicAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32',
        };
        const highlightedAttribDesc: GPUVertexAttribute = {
            shaderLocation: 2, // [[location(2)]]
            offset: 0,
            format: 'float32',
        };
        const thematicValidityAttribDesc: GPUVertexAttribute = {
            shaderLocation: 3,
            offset: 0,
            format: 'float32',
        };
        const skippedAttribDesc: GPUVertexAttribute = {
            shaderLocation: 4, // [[location(4)]]
            offset: 0,
            format: 'float32',
        };


        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 2, // sizeof(float) * 2
            stepMode: 'vertex',
        };
        const thematicBufferDesc: GPUVertexBufferLayout = {
            attributes: [thematicAttribDesc],
            arrayStride: 4 * 1, // sizeof(float) * 3
            stepMode: 'vertex',
        };
        const highlightedBufferDesc: GPUVertexBufferLayout = {
            attributes: [highlightedAttribDesc],
            arrayStride: 4 * 1, // sizeof(float) * 3
            stepMode: 'vertex',
        };
        const thematicValidityBufferDesc: GPUVertexBufferLayout = {
            attributes: [thematicValidityAttribDesc],
            arrayStride: 4 * 1,
            stepMode: 'vertex',
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
            buffers: [positionBufferDesc, thematicBufferDesc, highlightedBufferDesc, thematicValidityBufferDesc, skippedBufferDesc],
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
            label: 'Pipeline triangle flat',
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Records draw commands for this pipeline into a render pass.
     *
     * The method updates camera uniforms for the current frame, binds the
     * pipeline, vertex buffers, index buffer, and uniform bind groups, and
     * issues an indexed draw only when the index buffer contains at least one
     * element.
     *
     * @param camera Camera whose current view and projection state is uploaded
     * before drawing.
     * @param passEncoder Active render pass encoder that receives the draw
     * commands for this pipeline.
     * @returns Records an indexed draw for the current mesh when indices are available.
     */
    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline);

        // updates camera
        this.updateCameraUniforms(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._thematicBuffer);
        passEncoder.setVertexBuffer(2, this._highlightedBuffer);
        passEncoder.setVertexBuffer(3, this._thematicValidityBuffer);
        passEncoder.setVertexBuffer(4, this._skippedBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        // draw command
        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) { passEncoder.drawIndexed(indexCount); }
    }

}
