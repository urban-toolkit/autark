/// <reference types="@webgpu/types" />

import { Camera } from './camera';
import { ICameraData, IShaderColorData } from './interfaces';
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
    protected _matricesBuffer!: GPUBuffer;
    protected _matricesBindGroup!: GPUBindGroup;
    protected _matricesBindGroupLayout!: GPUBindGroupLayout;

    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    build(mesh: TrianglesLayer, camera: Camera, color: IShaderColorData) {
        this.createShaders();

        this.buildVertexBuffers(mesh);
        this.buildColorUniforms(color);
        this.buildCameraUniforms(camera);

        this.createPipeline();
    }

    buildCameraUniforms(camera: Camera) {
        const mview = camera.getModelViewMatrix();
        const projc = camera.getProjectionMatrix();

        const cameraArray = new Float32Array(2 * 16);
        cameraArray.set(mview, 0);
        cameraArray.set(projc, 16);

        this._matricesBuffer = this._renderer.device.createBuffer({
            label: 'Transfomration matrices buffer',
            size: cameraArray.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

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

    abstract buildVertexBuffers(data: TrianglesLayer): void;

    abstract buildColorUniforms(data: IShaderColorData): void;

    abstract createPipeline(): void;

    abstract createShaders(): void;

    abstract renderPass(camera: Camera): void;
}