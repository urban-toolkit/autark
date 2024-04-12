/// <reference types="@webgpu/types" />

import vertSrc from './shaders/triangles.vert.wgsl';
import fragSrc from './shaders/triangles.frag.wgsl';

import { Pipeline } from "./pipeline";
import { Renderer } from "./renderer";

export class PipelineTriangleFlat extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
    protected _indicesBuffer!: GPUBuffer;

    // Uniforms buffer
    protected _cBuffer!: GPUBuffer;
    protected _cMapTexture!: GPUTexture;
    protected _cMapSampler!: GPUSampler;
   
    protected _bindGroup!: GPUBindGroup;
    protected _bindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    updateVertexBuffers(mesh: any) {
        // vertex data
        this._positionBuffer = this.renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        
        // vertex data
        this._thematicBuffer = this.renderer.device.createBuffer({
            label: 'Thematic data buffer',
            size: mesh.thematic.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._indicesBuffer = this.renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        this.renderer.device.queue.writeBuffer(this._positionBuffer, 0, mesh.position);
        this.renderer.device.queue.writeBuffer(this._thematicBuffer, 0, mesh.thematic);
        this.renderer.device.queue.writeBuffer(this._indicesBuffer,  0, mesh.indices );
    }

    updateUniformBuffers(colors: any) {
        const color = new Float32Array(Object.values(colors.color));
        this._cBuffer = this.renderer.device.createBuffer({
            label: 'Fixed color buffer',
            size: color.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.renderer.device.queue.writeBuffer(this._cBuffer, 0, color);

        const cMap = new Uint8Array(colors.colorMap);
        this._cMapTexture = this.renderer.device.createTexture({
            label: 'Colormap texture',
            size: { width: 256, height: 1 },
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba8unorm',
        });
        this._cMapSampler = this.renderer.device.createSampler({
            label: 'Fixed color buffer',
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });
        this.renderer.device.queue.writeTexture({ texture: this._cMapTexture }, cMap, {}, { width: 256, height: 1 });

        const isColorMap = new Float32Array([colors.isColorMap]);
        const enableColorMap = this.renderer.device.createBuffer({
            label: 'Enable colormap on reder',
            size: isColorMap.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.renderer.device.queue.writeBuffer(enableColorMap, 0, isColorMap);

        this._bindGroupLayout = this.renderer.device.createBindGroupLayout({
            entries: [{
                binding: 0, // fixed color
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {},
            }, {
                binding: 1, // cMap texture
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            }, {
                binding: 2, // cMap sampler
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            }, {
                binding: 3, // show thematic data
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {},
            }]
        });

        this._bindGroup = this.renderer.device.createBindGroup({
            layout: this._bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this._cBuffer },
            }, {
                binding: 1,
                resource: this._cMapTexture.createView(),
            }, {
                binding: 2,
                resource: this._cMapSampler,
            }, {
                binding: 3,
                resource: { buffer: enableColorMap },
            }],
        });
    }

    createShaders() {
        // Vertex shader
        const vsmDesc = {
            code: vertSrc
        };
        this.vertModule = this.renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: fragSrc
        };
        this.fragModule = this.renderer.device.createShaderModule(fsmDesc);
    }

    createPipeline() {
        // Vertex data
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x3'
        };
        const thematicAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32'
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
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
            module: this.vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, thematicBufferDesc]
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this.fragModule,
            entryPoint: 'main',
            targets: [{
                format: 'bgra8unorm'
            }]
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
            depthCompare: 'less',
            format: 'depth24plus-stencil8'
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [
                this._bindGroupLayout
            ]
        };
        const layout = this.renderer.device.createPipelineLayout(pipelineLayoutDesc);

        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout, vertex, fragment, primitive, depthStencil
        };
        this.pipeline = this.renderer.device.createRenderPipeline(pipelineDesc);
    }

    setRenderPass() {
        // Create a new pass commands encoder
        const passEncoder = this.renderer.commandEncoder.beginRenderPass(this.renderer.renderPassDesc);

        // sets the current pipeline
        passEncoder.setPipeline(this.pipeline);

        // sets the viewport
        passEncoder.setViewport(
            0,
            0,
            this.renderer.canvas.width,
            this.renderer.canvas.height,
            0,
            1
        );
        passEncoder.setScissorRect(
            0,
            0,
            this.renderer.canvas.width,
            this.renderer.canvas.height
        );

        // vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._thematicBuffer);
        // primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint16');

        // uniforms buffer
        passEncoder.setBindGroup(0, this._bindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint16Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }
}