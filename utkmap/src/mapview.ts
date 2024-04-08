/// <reference types="@webgpu/types" />

import Renderer from './renderer';

export class MapView {
    renderer: Renderer;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        this.renderer.start();
    }
}