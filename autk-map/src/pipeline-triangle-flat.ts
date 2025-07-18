/// <reference types="@webgpu/types" />

import trianglesVertexSource from './shaders/triangles.vert.wgsl';
import trianglesFragmentSource from './shaders/triangles.frag.wgsl';

import heatmapVertexSource from './shaders/heatmap.vert.wgsl';
import heatmapFragmentSource from './shaders/heatmap.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { Triangles2DLayer } from './layer-triangles2D';

/**
 * PipelineTriangleFlat is a rendering pipeline for drawing flat triangles in 2D space.
 * It uses WebGPU to render triangles based on the provided mesh data.
 */
export class PipelineTriangleFlat extends Pipeline {
    /**
     * Vertex shader source code.
     * @type {string}
     */
    protected _vertexShaderSrc!: string;

    /**
     * Fragment shader source code.
     * @type {string}
     */
    protected _fragmentShaderSrc!: string;

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

    /**
     * Constructor for PipelineTriangleFlat
     * @param {Renderer} renderer The renderer instance
     * @param {string} shaderSrc The shader source to use
     */
    constructor(renderer: Renderer, shaderSrc: string = 'default') {
        super(renderer);

        switch (shaderSrc) {
            case 'heatmap':
                this._vertexShaderSrc = heatmapVertexSource;
                this._fragmentShaderSrc = heatmapFragmentSource;
                break;
            default:
                this._vertexShaderSrc = trianglesVertexSource;
                this._fragmentShaderSrc = trianglesFragmentSource;
                break;
        }
    }

    /**
     * Builds the pipeline with the provided mesh data.
     * @param {Triangles2DLayer} mesh The mesh data containing positions, thematic, and indices
     */
    build(mesh: Triangles2DLayer) {
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
    createShaders() {
        // Vertex shader
        const vsmDesc = {
            code: this._vertexShaderSrc,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: this._fragmentShaderSrc,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Creates the vertex buffers for the pipeline.
     * @param {Triangles2DLayer} mesh The mesh data containing positions, thematic, and indices
     */
    createVertexBuffers(mesh: Triangles2DLayer) {
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
     * @param {Triangles2DLayer} mesh The mesh data containing positions, thematic, and indices
     */
    updateVertexBuffers(mesh: Triangles2DLayer) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, new Float32Array(mesh.thematic));
        this._renderer.device.queue.writeBuffer(this._highlightedBuffer, 0, new Float32Array(mesh.highlightedVertices));
        this._renderer.device.queue.writeBuffer(this._skippedBuffer, 0, new Float32Array(mesh.skippedVertices));
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
    }

    /**
     * Creates the render pipeline for drawing triangles.
     */
    createPipeline() {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x3',
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
        const skippedAttribDesc: GPUVertexAttribute = {
            shaderLocation: 3, // [[location(3)]]
            offset: 0,
            format: 'float32',
        };


        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
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
        const skippedBufferDesc: GPUVertexBufferLayout = {
            attributes: [skippedAttribDesc],
            arrayStride: 4 * 1, // sizeof(float) * 3
            stepMode: 'vertex',
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, thematicBufferDesc, highlightedBufferDesc, skippedBufferDesc],
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
            depthCompare: 'less-equal',
            format: 'depth32float',
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [this._colorsBindGroupLayout, this._cameraBindGroupLayout],
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
            label: "Pipeline triangle flat"
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Renders the triangle flat pipeline.
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
        passEncoder.setVertexBuffer(1, this._thematicBuffer);
        passEncoder.setVertexBuffer(2, this._highlightedBuffer);
        passEncoder.setVertexBuffer(3, this._skippedBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }
}
