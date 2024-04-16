/// <reference types="@webgpu/types" />

import { Camera } from './camera';
import { Layer } from './layer';
import { TrianglesLayer } from './layer-triangles';
import { Renderer } from './renderer';

export abstract class Pipeline {
    // renderer reference
    protected _renderer: Renderer;

    // shaders
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;

    // render pipeline
    protected _pipeline!: GPURenderPipeline;

    // Transformation matrices uniform buffer
    protected _mviewBuffer!: GPUBuffer;
    protected _projcBuffer!: GPUBuffer;
    protected _cameraBindGroup!: GPUBindGroup;
    protected _cameraBindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    build(mesh: TrianglesLayer, camera: Camera) {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createColorUniformBuffers(mesh);
        this.createCameraUniformBuffers(camera);

        this.createPipeline();
    }

    createCameraUniformBuffers(camera: Camera) {
        const mview = new Float32Array(camera.getModelViewMatrix());
        const projc = new Float32Array(camera.getProjectionMatrix());

        this._mviewBuffer = this._renderer.device.createBuffer({
            label: 'ModelView matrix buffer',
            size: mview.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this._projcBuffer = this._renderer.device.createBuffer({
            label: 'Projection matrix buffer',
            size: projc.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this._cameraBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [{
                binding: 0, // modelview
                visibility: GPUShaderStage.VERTEX,
                buffer: {},
            }, {
                binding: 1, // projection
                visibility: GPUShaderStage.VERTEX,
                buffer: {},
            }]
        });

        this._cameraBindGroup = this._renderer.device.createBindGroup({
            layout: this._cameraBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this._mviewBuffer },
            }, {
                binding: 1,
                resource: { buffer: this._projcBuffer },
            }],
        });
    };

    updateCameraUniformBuffers(camera: Camera)  {
        const mview = new Float32Array(camera.getModelViewMatrix());
        const projc = new Float32Array(camera.getProjectionMatrix());

        this._renderer.device.queue.writeBuffer(this._mviewBuffer, 0, mview);
        this._renderer.device.queue.writeBuffer(this._projcBuffer, 0, projc);
    }

    abstract createVertexBuffers(data: Layer): void;

    abstract updateVertexBuffers(data: Layer): void;

    abstract createColorUniformBuffers(data: Layer): void;

    abstract createPipeline(): void;

    abstract createShaders(): void;

    abstract renderPass(data: Layer, camera: Camera): void;
}