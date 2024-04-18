/// <reference types="@webgpu/types" />

import buildingsVertexSource from './shaders/buildings.vert.wgsl';
import buildingsFragmentSource from './shaders/buildings.frag.wgsl';

import { Camera } from "./camera";
import { Renderer } from "./renderer";

import { BuildingsLayer } from "./layer-buildings";
import { PipelineTriangleFlat } from "./pipeline-triangle-flat";

export class PipelineBuildingFlat extends PipelineTriangleFlat {
    // Vertex buffers
    protected _normalBuffer!: GPUBuffer;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    createVertexBuffers(mesh: BuildingsLayer): void {
        super.createVertexBuffers(mesh);

        // vertex data
        this._normalBuffer = this._renderer.device.createBuffer({
            label: 'Normal buffer',
            size: mesh.normal.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(mesh: BuildingsLayer): void {
        super.updateVertexBuffers(mesh);
        // update normal
        this._renderer.device.queue.writeBuffer(this._normalBuffer, 0, new Float32Array(mesh.normal));
    }

    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: buildingsVertexSource
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: buildingsFragmentSource
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    createPipeline(): void {
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
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, normalBufferDesc, thematicBufferDesc]
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule,
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
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);

    }
    renderPass(mesh: BuildingsLayer, camera: Camera): void {
        // gets the pass commands encoder
        const passEncoder = this._renderer.passEncoder;

        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline);

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
    }
}