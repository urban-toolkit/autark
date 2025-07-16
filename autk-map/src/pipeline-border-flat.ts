/// <reference types="@webgpu/types" />

import linesVertexSource from './shaders/lines.vert.wgsl';
import linesFragmentSource from './shaders/lines.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { Triangles2DBorder } from './layer-triangles2D-borders';

export class PipelineBorderFlat extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _borderIndicesBuffer!: GPUBuffer;

    // shaders
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;

    // render pipeline
    protected _pipeline!: GPURenderPipeline;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    build(borders: Triangles2DBorder) {
        this.createShaders();

        this.createVertexBuffers(borders);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(borders);

        this.createPipeline();
    }

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

    createVertexBuffers(borders: Triangles2DBorder) {
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
    }

    updateVertexBuffers(borders: Triangles2DBorder) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(borders.borderPos));
        this._renderer.device.queue.writeBuffer(this._borderIndicesBuffer, 0, new Uint32Array(borders.borderIds));
    }

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

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc],
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
            label: "Pipeline border flat"
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

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

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._borderIndicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        passEncoder.drawIndexed(this._borderIndicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
        passEncoder.end();
    }
}
