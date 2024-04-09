/// <reference types="@webgpu/types" />

import Renderer from './renderer';

export default abstract class Pass {
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

    build(data: any) {
        this.updateBuffers(data);
        this.createShaders();
        this.createPipeline();
    }

    abstract updateBuffers(data: any): void;

    abstract createPipeline(): void;

    abstract createShaders(): void;

    abstract setRenderPass(): void;
}