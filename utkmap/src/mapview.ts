/// <reference types="@webgpu/types" />

import { LayerGeometryType, LayerPhysicalType, RenderStyle } from './constants';
import { ILayerData } from './interfaces';

import Renderer from './renderer';
import LayerManager from './layer-manager';

export class UtkMap {
    protected _layers: LayerManager;
    protected _renderer: Renderer;

    constructor(canvas: HTMLCanvasElement) {
        this._renderer = new Renderer(canvas);
        this._layers = new LayerManager();

        // const layer = new TrianglesLayer('teste.csv', LayerPhysicalType.SURFACE_LAYER, RenderStyle.INDEX_FLAT)
        // this._layers.push(layer);
    }

    async start() {
        await this._renderer.start();

        const layerInfo = {
            id: 'teste.csv',
            type: LayerGeometryType.TRIGMESH_LAYER,
            physical: LayerPhysicalType.SURFACE_LAYER,
            renderStyle: RenderStyle.INDEX_FLAT
        }
        this.loadLayer(layerInfo);
    }

    loadLayer(layerInfo: ILayerData) {
        const layer = this._layers.createLayer(layerInfo);

        if(layer) {
            layer.buildRenderPass(this._renderer);
        }
    }

    render() {
        // Starts the render
        this._renderer.beginRender()

        // Add layers to render pass
        const ls = this._layers.layers.forEach(layer => {
            layer.setRenderPass();
        });;

        // Ends the render
        this._renderer.endRender();

        // Refresh canvas
        requestAnimationFrame(this.render.bind(this));
    };
}