/// <reference types="@webgpu/types" />

import linesVertexSource from './shaders/lines.vert.wgsl';
import linesFragmentSource from './shaders/lines.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { Features2DLayer } from './layer-features2D';

export class PipelineBorderFlat extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _borderIndicesBuffer!: GPUBuffer;

    // shaders
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;

    // render pipeline
    protected _pipeline!: GPURenderPipeline;

    // points
    protected _borderIndices!: number[];

    constructor(renderer: Renderer) {
        super(renderer);
    }

    build(mesh: Features2DLayer) {
        this.createShaders();

        this.loadBorderIndices(mesh);
        this.createVertexBuffers(mesh);
        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();

        this.updateVertexBuffers(mesh);

        this.createPipeline();
    }

    loadBorderIndices(mesh: Features2DLayer) {
        const components = mesh.components;
        const indices: number[] = [];

        for (let i = 0; i < components.length; i++) {
            let start = i === 0 ? 0 : components[i - 1].nPoints;
            const end = components[i].nPoints;
            const count = end - start;

            if (count < 2) continue;

            // Create segments: (start, start+1), (start+1, start+2), ..., (end-2, end-1)
            for (let j = 0; j < count - 1; j++) {
                indices.push(start + j, start + j + 1);
            }

            // Close the ring by connecting last and first
            indices.push(end - 1, start);
        }
        this._borderIndices = indices;
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

    createVertexBuffers(mesh: Features2DLayer) {
        // vertex data
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // vertex data
        this._borderIndicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: this._borderIndices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(mesh: Features2DLayer) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._borderIndicesBuffer, 0, new Uint32Array(this._borderIndices));
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
