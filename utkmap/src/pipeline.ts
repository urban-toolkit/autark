/// <reference types="@webgpu/types" />

import { Renderer } from './renderer';

export abstract class Pipeline {
    // shaders
    vertModule!: GPUShaderModule;
    fragModule!: GPUShaderModule;

    // render pipeline
    pipeline!: GPURenderPipeline;

    // renderer reference
    renderer: Renderer;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
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