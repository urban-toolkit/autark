/// <reference types="@webgpu/types" />

import { ILayerData, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Renderer } from './renderer';
import { LayerManager } from './layer-manager';
import { KeyEvents } from './key-events';

export class UtkMap {
    protected _renderer: Renderer;
    protected _layerManager: LayerManager;

    protected _keyEvents: KeyEvents;

    constructor(canvas: HTMLCanvasElement) {
        this._renderer = new Renderer(canvas);
        this._layerManager = new LayerManager();

        this._keyEvents = new KeyEvents(this);
    }

    get layerManager() {
        return this._layerManager;
    }

    async init() {
        await this._renderer.init();
        this._keyEvents.bindEvents();
    }

    loadLayer(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);

        if (layer) {
            layer.buildPipeline(this._renderer);
        }
    }

    updateRenderInfo(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);
        
        if (layer) {
            layer.loadRenderInfo(layerRenderInfo);
            layer.buildPipeline(this._renderer);
        }
    }

    updateLayerData(layerInfo: ILayerInfo, layerData: ILayerData): void {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.loadGeometry(layerData.geometry);
            layer.loadThematic(layerData.thematic);
            layer.buildPipeline(this._renderer);
        }
    }

    updateLayerThematic(layerInfo: ILayerInfo, layerThematic: ILayerThematic[]): void {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.loadThematic(layerThematic);
            layer.buildPipeline(this._renderer);
        }
    }

    render() {
        // Starts the render
        this._renderer.beginEncoder()

        // Add layers to render pass
        this._layerManager.layers.forEach(layer => {
            layer.setRenderPass();
        });

        // Ends the render
        this._renderer.endEncoder();

        // Refresh canvas
        requestAnimationFrame(this.render.bind(this));
    };
}