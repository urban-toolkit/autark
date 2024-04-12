/// <reference types="@webgpu/types" />

import { Camera } from './camera';
import { ICameraData, IShaderColorData } from './interfaces';
import { TrianglesLayer } from './layer-triangles';
import { Renderer } from './renderer';

export abstract class Pipeline {
    // shaders
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;

    // render pipeline
    protected _pipeline!: GPURenderPipeline;

    // renderer reference
    protected _renderer: Renderer;

    // Transformation matrices uniform buffer
    protected _matricesBuffer!: GPUBuffer;
    protected _matricesBindGroup!: GPUBindGroup;
    protected _matricesBindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    build(mesh: TrianglesLayer, camera: Camera, color: IShaderColorData) {
        this.createShaders();

        this.updateVertexBuffers(mesh);
        this.updateColorUniforms(color);
        this.updateCameraUniforms(camera);

        console.log(camera.getModelViewMatrix());
        console.log(camera.getProjectionMatrix());

        this.createPipeline();
    }

    updateCameraUniforms(camera: Camera) {
        const mview = camera.getModelViewMatrix();
        const projc = camera.getProjectionMatrix();

        const mats = new Float32Array( Array.from(mview).concat(Array.from(projc)) );
        this._matricesBuffer = this._renderer.device.createBuffer({
            label: 'Transfomration matrices buffer',
            size: mats.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this._renderer.device.queue.writeBuffer(this._matricesBuffer, 0, mats);

        this._matricesBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [{
                binding: 0, // matrices
                visibility: GPUShaderStage.VERTEX,
                buffer: {},
            }]
        });

        this._matricesBindGroup = this._renderer.device.createBindGroup({
            layout: this._matricesBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this._matricesBuffer },
            }],
        });

    };

    abstract updateVertexBuffers(data: TrianglesLayer): void;

    abstract updateColorUniforms(data: IShaderColorData): void;

    abstract createPipeline(): void;

    abstract createShaders(): void;

    abstract setRenderPass(nElems: number): void;
}