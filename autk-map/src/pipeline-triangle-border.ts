/// <reference types="@webgpu/types" />

import linesVertexSource from './shaders/triangle-02.vert.wgsl';
import linesFragmentSource from './shaders/triangle-02.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { Triangles2DLayer } from './layer-triangles2D';

/**
 * PipelineBorderFlat is a rendering pipeline for drawing flat borders of triangles in 2D space.
 * It uses WebGPU to render lines based on the provided border data.
 */
export class PipelineTriangleBorder extends Pipeline {
    /**
     * Position buffer for vertex data.
     * @type {GPUBuffer}
     */
    protected _positionBuffer!: GPUBuffer;

    /**
     * Buffer for border indices.
     * @type {GPUBuffer}
     */
    protected _borderIndicesBuffer!: GPUBuffer;

    /**
     * Buffer for skipped data.
     * @type {GPUBuffer}
     */
    protected _skippedBuffer!: GPUBuffer;

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
     * Render pipeline for drawing borders.
     * @type {GPURenderPipeline}
     */
    protected _pipeline!: GPURenderPipeline;

    /**
     * Constructor for PipelineBorderFlat
     * @param {Renderer} renderer The renderer instance
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Builds the pipeline with the provided border data.
     * @param {Triangles2DLayer} borders The border data containing positions and indices
     */
    build(borders: Triangles2DLayer) {
        this.createShaders();

        this.createVertexBuffers(borders);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(borders);

        this.createPipeline();
    }

    /**
     * Creates the vertex and fragment shaders for the pipeline.
     */
    createShaders() {
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
     * Creates the vertex buffers for the pipeline.
     * @param {Triangles2DLayer} borders The border data containing positions and indices
     */
    createVertexBuffers(borders: Triangles2DLayer) {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: borders.borderPos.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._borderIndicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: borders.borderIds.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._skippedBuffer = this._renderer.device.createBuffer({
            label: 'Skipped data buffer',
            size: borders.skippedVertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });    }

    /**
     * Updates the vertex buffers with the provided border data.
     * @param {Triangles2DLayer} borders The border data containing positions and indices
     */
    updateVertexBuffers(borders: Triangles2DLayer) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(borders.borderPos));
        this._renderer.device.queue.writeBuffer(this._borderIndicesBuffer, 0, new Uint32Array(borders.borderIds));
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, new Float32Array(borders.skippedVertices));
    }

    /**
     * Creates the render pipeline for drawing borders.
     */
    createPipeline() {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x3',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
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
                    format: 'bgra8unorm',
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
            depthCompare: 'less-equal',
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
            label: "Pipeline border flat"
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Renders the border flat pipeline.
     * @param {Camera} camera The camera instance
     */
    renderPass(camera: Camera) {
        // Create a new command encoder
        const commandEncoder = this._renderer.commandEncoder;

        // changes buffer behaviour
        this._renderer.frameBuffer.loadOp = 'load';

        // Render pass description
        const renderPassDesc = {
            colorAttachments: [this._renderer.frameBuffer],
            depthStencilAttachment: this._renderer.depthBuffer,
        };

        // Create a new pass commands encoder
        const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);

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

        passEncoder.drawIndexed(this._borderIndicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }
}
