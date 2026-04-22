/// <reference types="@webgpu/types" />

import trianglesVertexSource from './shaders/triangle-01.vert.wgsl';
import trianglesFragmentSource from './shaders/triangle-01.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './types-core';

import { VectorLayer } from './layer-vector';

/**
 * PipelineTriangleFlat is a rendering pipeline for drawing flat triangles in 2D space.
 * It uses WebGPU to render triangles based on the provided mesh data.
 */
export class PipelineTriangleFlat extends Pipeline {
    /**
     * Position buffer for vertex data.
     * @type {GPUBuffer}
     */
    protected _positionBuffer!: GPUBuffer;

    /**
     * Buffer for thematic data.
     * @type {GPUBuffer}
     */
    protected _thematicBuffer!: GPUBuffer;
    /** Buffer for thematic validity data. */
    protected _thematicValidityBuffer!: GPUBuffer;

    /**
     * Buffer for highlighted data.
     * @type {GPUBuffer}
     */
    protected _highlightedBuffer!: GPUBuffer;

    /**
     * Buffer for skipped data.
     * @type {GPUBuffer}
     */
    protected _skippedBuffer!: GPUBuffer;

    /**
     * Buffer for primitive indices.
     * @type {GPUBuffer}
     */
    protected _indicesBuffer!: GPUBuffer;



    /**
     * Vertex shader module.
     * @type {GPUShaderModule}
     */
    protected _vertModule!: GPUShaderModule;

    /**
     * Fragment shader module.
     * @type {GPUShaderModule}
     */
    protected _fragModule!: GPUShaderModule;



    /**
     * Render pipeline for drawing triangles.
     * @type {GPURenderPipeline}
     */
    protected _pipeline!: GPURenderPipeline;

    /** Reused upload buffer for positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for thematic values. */
    private _thematicData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for thematic validity flags. */
    private _thematicValidityData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for highlighted flags. */
    private _highlightedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for skipped flags. */
    private _skippedData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;



    /**
     * Constructor for PipelineTriangleFlat
     * @param {Renderer} renderer The renderer instance
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /** Releases GPU resources owned by this pipeline. */
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
     * Builds the pipeline with the provided mesh data.
     * @param {VectorLayer} mesh The mesh data containing positions, thematic, and indices
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
     * Creates the vertex and fragment shaders for the pipeline.
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
     * Creates the vertex buffers for the pipeline.
     * @param {VectorLayer} mesh The mesh data containing positions, thematic, and indices
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
     * Updates the vertex buffers with the provided mesh data.
     * @param {VectorLayer} mesh The mesh data containing positions, thematic, and indices
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
     * Creates the render pipeline for drawing triangles.
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
     * Renders the triangle flat pipeline.
     * @param {Camera} camera The camera instance
     */
    renderPass(camera: Camera): void {
        // Create a new command encoder
        const commandEncoder = this._renderer.commandEncoder;

        // Create a new pass commands encoder
        const passEncoder = this._beginMainRenderPass(commandEncoder);

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
        passEncoder.end();
    }

}
