/// <reference types="@webgpu/types" />

import { ICameraData, ILayerData, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { LayerManager } from './layer-manager';

export class UtkMap {
    protected _camera: Camera;
    protected _renderer: Renderer;
    protected _keyEvents: KeyEvents;
    protected _layerManager: LayerManager;

    constructor(canvas: HTMLCanvasElement) {
        this._camera = new Camera();
        this._renderer = new Renderer(canvas);
        this._keyEvents = new KeyEvents(this);
        this._layerManager = new LayerManager();
    }

    get layerManager() {
        return this._layerManager;
    }

    async init() {
        await this._renderer.init();
        this._keyEvents.bindEvents();
    }

    loadCamera(params: ICameraData) {
        this._camera = new Camera(params, /*this._updateStatusCallback*/);
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