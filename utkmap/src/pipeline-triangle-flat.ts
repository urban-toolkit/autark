/// <reference types="@webgpu/types" />

import trianglesVertexSource from './shaders/triangles.vert.wgsl';
import trianglesFragmentSource from './shaders/triangles.frag.wgsl';

import { Pipeline } from "./pipeline";
import { Renderer } from "./renderer";

import { Camera } from './camera';
import { MapStyle } from './map-style';
import { ColorMap } from './colormap';

import { TrianglesLayer } from './layer-triangles';

export class PipelineTriangleFlat extends Pipeline {
    // Vertex buffers
    protected _positionBuffer!: GPUBuffer;
    protected _thematicBuffer!: GPUBuffer;
    protected _indicesBuffer!: GPUBuffer;

    // Uniforms buffer
    protected _colorBuffer!: GPUBuffer;
    protected _useColorMap!: GPUBuffer;
    protected _cMapTexture!: GPUTexture;
    protected _cMapSampler!: GPUSampler;

    protected _colorsBindGroup!: GPUBindGroup;
    protected _colorsBindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        super(renderer);
    }

    createVertexBuffers(mesh: TrianglesLayer) {
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
        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    updateVertexBuffers(mesh: TrianglesLayer) {
        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
        this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, new Float32Array(mesh.thematic));
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
    }

    createColorUniformBuffers() {
        this._colorBuffer = this._renderer.device.createBuffer({
            label: 'Fixed color buffer',
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this._useColorMap = this._renderer.device.createBuffer({
            label: 'Enable colormap on reder',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this._cMapTexture = this._renderer.device.createTexture({
            label: 'Colormap texture',
            size: { width: 256, height: 1 },
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba8unorm',
        });
        this._cMapSampler = this._renderer.device.createSampler({
            label: 'Fixed color buffer',
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        this._colorsBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [{
                binding: 0, // fixed color
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {},
            }, {
                binding: 1, // show thematic data
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {},
            }, {
                binding: 2, // cMap texture
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            }, {
                binding: 3, // cMap sampler
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            }]
        });

        this._colorsBindGroup = this._renderer.device.createBindGroup({
            layout: this._colorsBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this._colorBuffer },
            }, {
                binding: 1,
                resource: { buffer: this._useColorMap },
            }, {
                binding: 2,
                resource: this._cMapTexture.createView(),
            }, {
                binding: 3,
                resource: this._cMapSampler,
            }],
        });
    }

    updateColorUniformBuffers(mesh: TrianglesLayer) {
        const colors = {
            color: MapStyle.getColor(mesh.layerInfo.typePhysical),
            colorMap: ColorMap.getColorMap(mesh.layerRenderInfo.colorMapInterpolator),
            useColorMap: <boolean>mesh.layerRenderInfo.isColorMap
        }

        const color = new Float32Array(Object.values(colors.color));
        const useCcolorMap = new Float32Array([colors.useColorMap ? 1.0 : 0.0]);
        const colorMapTexture = new Uint8Array(colors.colorMap);

        this._renderer.device.queue.writeBuffer(this._colorBuffer, 0, color);
        this._renderer.device.queue.writeBuffer(this._useColorMap, 0, useCcolorMap);
        this._renderer.device.queue.writeTexture({ texture: this._cMapTexture }, colorMapTexture, {}, { width: 256, height: 1 });
    }

    createShaders() {
        // Vertex shader
        const vsmDesc = {
            code: trianglesVertexSource
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: trianglesFragmentSource
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
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
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, thematicBufferDesc]
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

        // Antialising
        const multisample: GPUMultisampleState = {
            count: this._renderer.sampleCount,
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: false,
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
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    renderPass(mesh: TrianglesLayer, camera: Camera) {
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
        passEncoder.setVertexBuffer(1, this._thematicBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._colorsBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        // draw command
        passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
    }
}