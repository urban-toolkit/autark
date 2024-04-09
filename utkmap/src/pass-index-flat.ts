/// <reference types="@webgpu/types" />

import vertSrc from './shaders/trig.vert.wgsl';
import fragSrc from './shaders/trig.frag.wgsl';

import Pass from "./pass";
import Renderer from "./renderer";

export default class PassIndexFlat extends Pass {
    // Resources
    protected _positionBuffer!: GPUBuffer;
    protected _colorBuffer!: GPUBuffer;
    protected _indexBuffer!: GPUBuffer;
    
    constructor(renderer: Renderer) {
        super(renderer);
    }

    // Adjust to recieve a pointset | polyline | mesh | grid
    updateBuffers(data: any) {
        this._positionBuffer = Renderer.createBuffer(this.renderer.device, data.positions, GPUBufferUsage.VERTEX);
        this._colorBuffer = Renderer.createBuffer(this.renderer.device, data.colors, GPUBufferUsage.VERTEX);
        this._indexBuffer = Renderer.createBuffer(this.renderer.device, data.indices, GPUBufferUsage.INDEX);
    }

    createShaders() {
        // Shaders
        const vsmDesc = {
            code: vertSrc
        };
        this.vertModule = this.renderer.device.createShaderModule(vsmDesc);

        const fsmDesc = {
            code: fragSrc
        };
        this.fragModule = this.renderer.device.createShaderModule(fsmDesc);
    }

    createPipeline() {
        // Input Assembly
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: 0,
            format: 'float32x3'
        };
        const colorAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32x3'
        };
        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
            stepMode: 'vertex'
        };
        const colorBufferDesc: GPUVertexBufferLayout = {
            attributes: [colorAttribDesc],
            arrayStride: 4 * 3, // sizeof(float) * 3
            stepMode: 'vertex'
        };

        // Depth Buffer
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus-stencil8'
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this.vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, colorBufferDesc]
        };

        // Fragment Shader
        const colorState: GPUColorTargetState = {
            format: 'bgra8unorm'
        };
        const fragment: GPUFragmentState = {
            module: this.fragModule,
            entryPoint: 'main',
            targets: [colorState]
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list'
        };

        // Uniform Data
        const pipelineLayoutDesc = { bindGroupLayouts: [] };
        const layout = this.renderer.device.createPipelineLayout(pipelineLayoutDesc);

        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout,

            vertex,
            fragment,

            primitive,
            depthStencil
        };
        this.pipeline = this.renderer.device.createRenderPipeline(pipelineDesc);
    }

    setRenderPass() {
        // Encode drawing commands
        this.renderer.passEncoder.setPipeline(this.pipeline);
        this.renderer.passEncoder.setViewport(
            0,
            0,
            this.renderer.canvas.width,
            this.renderer.canvas.height,
            0,
            1
        );
        this.renderer.passEncoder.setScissorRect(
            0,
            0,
            this.renderer.canvas.width,
            this.renderer.canvas.height
        );
        this.renderer.passEncoder.setVertexBuffer(0, this._positionBuffer);
        this.renderer.passEncoder.setVertexBuffer(1, this._colorBuffer);
        this.renderer.passEncoder.setIndexBuffer(this._indexBuffer, 'uint16');
        this.renderer.passEncoder.drawIndexed(3, 1);
        this.renderer.passEncoder.end();
    }

}