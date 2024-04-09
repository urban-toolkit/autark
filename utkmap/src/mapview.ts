/// <reference types="@webgpu/types" />

import { LayerGeometryType, LayerPhysicalType, RenderStyle } from './constants';

import Layer from './layer';
import TrianglesLayer from './layer-triangles';

import Renderer from './renderer';

export class UtkMap {
    layer: Layer[] = [];
    renderer: Renderer;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);

        const layer = new TrianglesLayer('teste.csv', LayerPhysicalType.SURFACE_LAYER, RenderStyle.INDEX_FLAT)
        this.layer.push(layer);
    }

    async start() {
        await this.renderer.start();

        this.layer.forEach(l => l.buildRenderPass(this.renderer));
    }

    render() {
        // Starts the render
        this.renderer.beginRender()

        // Add layers to render pass
        this.layer.forEach(l => l.setRenderPass());

        // Ends the render
        this.renderer.endRender();

        // Refresh canvas
        requestAnimationFrame(this.render.bind(this));
    };
}