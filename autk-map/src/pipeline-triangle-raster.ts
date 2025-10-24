/// <reference types="@webgpu/types" />

import rasterVertexSource from './shaders/raster.vert.wgsl';
import rasterFragmentSource from './shaders/raster.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { RasterLayer } from './layer-raster';

/**
 * PipelineTriangleRaster is a rendering pipeline for drawing rasterized triangles.
 * It uses WebGPU to render triangles based on the provided mesh data.
 */
export class PipelineTriangleRaster extends Pipeline {
    /**
     * Position buffer for vertex data.
     * @type {GPUBuffer}
     */
    protected _positionBuffer!: GPUBuffer;

    /**
     * Buffer for primitive indices.
     * @type {GPUBuffer}
     */
    protected _texCoordBuffer!: GPUBuffer;

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
     * Raster uniform buffer
     */
    protected _rasterBuffer!: GPUTexture;
    /**
     * Raster bind group
     */
    protected _rasterBindGroup!: GPUBindGroup;

    /**
     * Raster bind group layout
     */
    protected _rasterBindGroupLayout!: GPUBindGroupLayout;

    /**
     * Constructor for PipelineTriangleFlat
     * @param {Renderer} renderer The renderer instance
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Builds the pipeline with the provided mesh data.
     * @param {RasterLayer} mesh The mesh data containing positions, thematic, and indices
     */
    build(mesh: RasterLayer) {
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
     * Creates the vertex and fragment shaders for the pipeline.
     */
    createShaders() {
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
     * Creates the vertex buffers for the pipeline.
     * @param {RasterLayer} raster The mesh data containing positions, thematic, and indices
     */
    override createVertexBuffers(raster: RasterLayer) {
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
     * Updates the vertex buffers with the provided mesh data.
     * @param {RasterLayer} mesh The mesh data containing positions, thematic, and indices
     */
    override updateVertexBuffers(mesh: RasterLayer) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._texCoordBuffer, 0, new Float32Array(mesh.texCoord));
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
    }

    /**
     * Creates the raster uniform bind group.
     */
    createRasterUniformBindGroup(raster: RasterLayer) {
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
     * Updates the raster uniform buffer with the provided raster data.
     * @param {RasterLayer} layer The raster layer containing raster data
     */
    updateRasterUniforms(raster: RasterLayer) {
        const rasterTexture = new Uint8Array(raster.rasterData);

        console.log("----------------------------")
        console.log( {raster} ); 

        this._renderer.device.queue.writeTexture(
            { texture: this._rasterBuffer },
            rasterTexture,
            {
                bytesPerRow: raster.rasterResX * 4,
                rowsPerImage: raster.rasterResY 
            },
            { width: raster.rasterResX, height: raster.rasterResY },
        );
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

        // Vertex data
        const texCoordAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32x2',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
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
            label: "Pipeline Raster"
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
        passEncoder.setVertexBuffer(1, this._texCoordBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);
        passEncoder.setBindGroup(2, this._rasterBindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }
}
