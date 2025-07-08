/// <reference types="@webgpu/types" />

import buildingsVS01 from './shaders/buildings-01.vert.wgsl';
import buildingsFS01 from './shaders/buildings-01.frag.wgsl';

import buildingsVS02 from './shaders/buildings-02.vert.wgsl';
import buildingsFS02 from './shaders/buildings-02.frag.wgsl';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { Pipeline } from './pipeline';
import { BuildingsLayer } from './layer-buildings';

export class PipelineBuildingSSAO extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _normalBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
    protected _highlightedBuffer!: GPUBuffer;
    protected _indicesBuffer!: GPUBuffer;

    // colors and normal map
    protected _vertModule01!: GPUShaderModule;
    protected _fragModule01!: GPUShaderModule;

    // SSAO computation
    protected _vertModule02!: GPUShaderModule;
    protected _fragModule02!: GPUShaderModule;

    // first pass (normal & color maps)
    protected _pipeline01!: GPURenderPipeline;
    // first pass (SSAO)
    protected _pipeline02!: GPURenderPipeline;

    // Output buffers (Pass 01)
    protected _colorsSharedBuffer!: GPURenderPassColorAttachment;
    protected _normalsSharedBuffer!: GPURenderPassColorAttachment;
    // Depth buffer
    protected _depthBufferPass01!: GPURenderPassDepthStencilAttachment;

    // Input Bind Groups
    protected _texturesPass02BindGroup!: GPUBindGroup;
    protected _texturesPass02BindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    build(mesh: BuildingsLayer) {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.createSharedTextures();
        this.createDepthBufferPass01();
        this.createTexturesBindGroupPass02();

        this.updateVertexBuffers(mesh);
        this.updateColorUniforms(mesh);

        this.createPipeline01();
        this.createPipeline02();
    }

    createShaders(): void {
        // Vertex shader
        const vsDesc01 = {
            label: 'Buidlings ssao: vertex shader pass 01',
            code: buildingsVS01,
        };
        this._vertModule01 = this._renderer.device.createShaderModule(vsDesc01);

        // Fragment shader
        const fsDesc01 = {
            label: 'Buidlings ssao: fragment shader pass 01',
            code: buildingsFS01,
        };
        this._fragModule01 = this._renderer.device.createShaderModule(fsDesc01);

        // Vertex shader
        const vsDesc02 = {
            label: 'Buidlings ssao: vertex shader pass 02',
            code: buildingsVS02,
        };
        this._vertModule02 = this._renderer.device.createShaderModule(vsDesc02);

        // Fragment shader
        const fsDesc02 = {
            label: 'Buidlings ssao: fragment shader pass 02',
            code: buildingsFS02,
        };
        this._fragModule02 = this._renderer.device.createShaderModule(fsDesc02);
    }

    createVertexBuffers(mesh: BuildingsLayer): void {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._normalBuffer = this._renderer.device.createBuffer({
            label: 'Normal buffer',
            size: mesh.normal.length * 4,
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
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        this.updateVertexBuffers(mesh);
    }

    updateVertexBuffers(mesh: BuildingsLayer): void {
        this._renderer.device.queue.writeBuffer(this._normalBuffer, 0, new Float32Array(mesh.normal));
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, new Float32Array(mesh.thematic));
        this._renderer.device.queue.writeBuffer(this._highlightedBuffer, 0, new Float32Array(mesh.highlightedVertices));
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
    }

    createSharedTextures() {
        const colorTextureDesc: GPUTextureDescriptor = {
            label: 'Shared colors texture',
            size: [2 * this._renderer.canvas.width, 2 * this._renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        };
        const colorTexture = this._renderer.device.createTexture(colorTextureDesc);
        const colorTextureView = colorTexture.createView();

        this._colorsSharedBuffer = {
            view: colorTextureView,
            clearValue: [0.0, 0.0, 0.0, 0.0],
            loadOp: 'clear',
            storeOp: 'store',
        };

        const normalsTextureDesc: GPUTextureDescriptor = {
            label: 'Shared normals texture',
            size: [2 * this._renderer.canvas.width, 2 * this._renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        };
        // GBuffer texture render targets
        const normalsTexture = this._renderer.device.createTexture(normalsTextureDesc);
        const normalsTextureView = normalsTexture.createView();

        this._normalsSharedBuffer = {
            view: normalsTextureView,
            clearValue: [0.0, 0.0, 0.0, 0.0],
            loadOp: 'clear',
            storeOp: 'store',
        };
    }

    createDepthBufferPass01() {
        // Depth texture
        const depthTextureDesc: GPUTextureDescriptor = {
            label: 'Pass 01 depth texture',
            size: [2 * this._renderer.canvas.width, 2 * this._renderer.canvas.height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        };
        const depthTexture = this._renderer.device.createTexture(depthTextureDesc);
        const depthTextureView = depthTexture.createView();

        this._depthBufferPass01 = {
            view: depthTextureView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    createTexturesBindGroupPass02() {
        const texSampler = this._renderer.device.createSampler({
            label: 'Pass 02 sampler',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });

        this._texturesPass02BindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
            ],
        });

        this._texturesPass02BindGroup = this._renderer.device.createBindGroup({
            layout: this._texturesPass02BindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: texSampler,
                },
                {
                    binding: 1,
                    resource: this._colorsSharedBuffer.view,
                },
                {
                    binding: 2,
                    resource: this._normalsSharedBuffer.view,
                },
            ],
        });
    }

    createPipeline01(): void {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        };
        const normalAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1,
            offset: 0,
            format: 'float32x3',
        };
        const thematicAttribDesc: GPUVertexAttribute = {
            shaderLocation: 2,
            offset: 0,
            format: 'float32',
        };
        const highlightedAttribDesc: GPUVertexAttribute = {
            shaderLocation: 3,
            offset: 0,
            format: 'float32',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
            stepMode: 'vertex',
        };
        const normalBufferDesc: GPUVertexBufferLayout = {
            attributes: [normalAttribDesc],
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

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule01,
            entryPoint: 'main',
            buffers: [positionBufferDesc, normalBufferDesc, thematicBufferDesc, highlightedBufferDesc],
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule01,
            entryPoint: 'main',
            targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }],
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list',
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
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
            label: "Pipeline triangle ssao 01"
        };
        this._pipeline01 = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    createPipeline02(): void {
        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule02,
            entryPoint: 'main',
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule02,
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
            topology: 'triangle-strip',
            stripIndexFormat: 'uint32',
        };

        // Antialising
        const multisample: GPUMultisampleState = {
            count: this._renderer.sampleCount,
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'less-equal',
            format: 'depth32float',
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [this._colorsBindGroupLayout, this._texturesPass02BindGroupLayout],
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
            label: "Pipeline triangle ssao 02"
        };
        this._pipeline02 = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    pass01(camera: Camera) {
        // Create a new command encoder
        const commandEncoder = this._renderer.commandEncoder;

        // Pass 01 descriptor
        const passDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [this._colorsSharedBuffer, this._normalsSharedBuffer],
            depthStencilAttachment: this._depthBufferPass01,
        };

        // Create a new pass commands encoder
        const passEncoder = commandEncoder.beginRenderPass(passDescriptor);

        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline01);

        // updates camera
        this.updateCameraUniforms(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._normalBuffer);
        passEncoder.setVertexBuffer(2, this._thematicBuffer);
        passEncoder.setVertexBuffer(3, this._highlightedBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }

    pass02() {
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
        passEncoder.setPipeline(this._pipeline02);

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._texturesPass02BindGroup);

        // draw command
        passEncoder.draw(6);
        passEncoder.end();
    }

    renderPass(camera: Camera): void {
        this.pass01(camera);
        this.pass02();
    }
}
