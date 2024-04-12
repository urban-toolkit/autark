/// <reference types="@webgpu/types" />

import { Renderer } from './renderer';

export abstract class Pipeline {
    // shaders
    protected _vertModule!: GPUShaderModule;
    protected _fragModule!: GPUShaderModule;

    // render pipeline
    protected _pipeline!: GPURenderPipeline;

    // renderer reference
    protected _renderer: Renderer;

    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    build(mesh: any, color: any) {
        this.createShaders();
        this.updateVertexBuffers(mesh);
        this.updateUniformBuffers(color);
        this.createPipeline();
    }

    abstract updateVertexBuffers(data: any): void;

    abstract updateUniformBuffers(data: any): void;

    abstract createPipeline(): void;

    abstract createShaders(): void;

    abstract setRenderPass(nElems: number): void;
}