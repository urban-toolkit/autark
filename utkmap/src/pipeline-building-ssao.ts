/// <reference types="@webgpu/types" />

import buildingsVS01 from './shaders/buildings-01.vert.wgsl';
import buildingsFS01 from './shaders/buildings-01.frag.wgsl';

import buildingsVS02 from './shaders/buildings-02.vert.wgsl';
import buildingsFS02 from './shaders/buildings-02.frag.wgsl';

import { Camera } from "./camera";
import { Renderer } from "./renderer";

import { Pipeline } from './pipeline';
import { BuildingsLayer } from "./layer-buildings";

export class PipelineBuildingSSAO extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _normalBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
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

    constructor(renderer: Renderer) {
        super(renderer);
    }

    build(mesh: BuildingsLayer) {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createCameraUniformBuffers();
        this.createColorUniformBuffers();

        this.createPipeline01();
        this.createPipeline02();
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
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(mesh: BuildingsLayer): void {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._normalBuffer, 0, new Float32Array(mesh.normal));
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, new Float32Array(mesh.thematic));
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
    }

    createShaders(): void {
        // Vertex shader
        const vsDesc01 = {
            code: buildingsVS01
        };
        this._vertModule01 = this._renderer.device.createShaderModule(vsDesc01);

        // Fragment shader
        const fsDesc01 = {
            code: buildingsFS01
        };
        this._fragModule01 = this._renderer.device.createShaderModule(fsDesc01);


        // Vertex shader
        const vsDesc02 = {
            code: buildingsVS02
        };
        this._vertModule02 = this._renderer.device.createShaderModule(vsDesc02);

        // Fragment shader
        const fsDesc02 = {
            code: buildingsFS02
        };
        this._fragModule02 = this._renderer.device.createShaderModule(fsDesc02);
    }

    createPipeline01(): void {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3'
        };
        const normalAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1,
            offset: 0,
            format: 'float32x3'
        };
        const thematicAttribDesc: GPUVertexAttribute = {
            shaderLocation: 2,
            offset: 0,
            format: 'float32'
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
            stepMode: 'vertex'
        };
        const normalBufferDesc: GPUVertexBufferLayout = {
            attributes: [normalAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
            stepMode: 'vertex'
        };
        const thematicBufferDesc: GPUVertexBufferLayout = {
            attributes: [thematicAttribDesc],
            arrayStride: 4 * 1, // sizeof(float) * 3
            stepMode: 'vertex'
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule01,
            entryPoint: 'main',
            buffers: [positionBufferDesc, normalBufferDesc, thematicBufferDesc]
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule01,
            entryPoint: 'main',
            targets: [
                { format: 'rgba16float' },
                { format: 'bgra8unorm' }
            ]
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list'
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'less-equal',
            format: 'depth32float'
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [
                this._colorsBindGroupLayout,
                this._cameraBindGroupLayout
            ]
        };

        // Pipeline
        const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout, vertex, fragment, primitive, depthStencil
        };
        this._pipeline01 = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    createPipeline02(): void {
        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule02,
            entryPoint: 'main'
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule01,
            entryPoint: 'main',
            targets: [
                { format: 'bgra8unorm' },
            ]
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            topology: 'triangle-strip',
            stripIndexFormat: "uint32"
        };

        // Antialising
        const multisample: GPUMultisampleState = {
            count: this._renderer.sampleCount,
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'less-equal',
            format: 'depth32float'
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [
                this._colorsBindGroupLayout,
                this._cameraBindGroupLayout
            ]
        };

        // Pipeline
        const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout, vertex, fragment, primitive, depthStencil, multisample
        };
        this._pipeline02 = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    pass01(mesh: BuildingsLayer, camera: Camera) {
        // GBuffer texture render targets
        const gBufferTextureNormals = this._renderer.device.createTexture({
            size: [this._renderer.canvas.width, this._renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });
        const gBufferTextureColor = this._renderer.device.createTexture({
            size: [this._renderer.canvas.width, this._renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'bgra8unorm',
        });
        const depthTexture = this._renderer.device.createTexture({
            size: [this._renderer.canvas.width, this._renderer.canvas.height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        const writeGBufferPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: gBufferTextureNormals.createView(),
                    clearValue: [0.0, 0.0, 1.0, 1.0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: gBufferTextureColor.createView(),
                    clearValue: [0, 0, 0, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                }
            ],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        };
    
        // Create a new command encoder
        const commandEncoder = this._renderer.device.createCommandEncoder();

        // Create a new pass commands encoder
        const passEncoder = commandEncoder.beginRenderPass(writeGBufferPassDescriptor);

        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline01);

        // updates all data
        this.updateVertexBuffers(mesh);
        this.updateColorUniformBuffers(mesh);
        this.updateCameraUniformBuffers(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._normalBuffer);
        passEncoder.setVertexBuffer(2, this._thematicBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();

        // Copy the rendering results from the swapchain.
        // commandEncoder.copyTextureToTexture(
        //     { texture: outputTexture }, 
        //     { texture: storedTexture }, 
        //     {
        //         width: presentationSize[0],
        //         height: presentationSize[1],
        //         depthOrArrayLayers: 1
        //     }
        // );

        this._renderer.device.queue.submit([commandEncoder.finish()]);
    }

    pass02() {

    }

    renderPass(mesh: BuildingsLayer, camera: Camera): void {
        this.pass01(mesh, camera);
    }
}