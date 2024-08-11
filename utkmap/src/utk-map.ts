/// <reference types="@webgpu/types" />

import { ICameraData, ILayerData, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { LayerManager } from './layer-manager';

export class UtkMap {
  protected _camera: Camera;
  protected _renderer: Renderer;
  protected _keyEvents: KeyEvents;
  protected _mouseEvents: MouseEvents;
  protected _layerManager: LayerManager;

  constructor(canvas: HTMLCanvasElement) {
    this._camera = new Camera();
    this._renderer = new Renderer(canvas);
    this._keyEvents = new KeyEvents(this);
    this._mouseEvents = new MouseEvents(this);
    this._layerManager = new LayerManager();
  }

  get camera(): Camera {
    return this._camera;
  }

  get renderer(): Renderer {
    return this._renderer;
  }

  get layerManager(): LayerManager {
    return this._layerManager;
  }

  async init() {
    await this._renderer.init();

    this._keyEvents.bindEvents();
    this._mouseEvents.bindEvents();

    this.render();
  }

  createCamera(params: ICameraData) {
    this._camera = new Camera(params);
  }

  createLayer(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
    const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);

    if (layer) {
      layer.createPipeline(this._renderer, this._camera);
    }
  }

  updateRenderInfo(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
    const layer = this._layerManager.searchByLayerInfo(layerInfo);

    if (layer) {
      layer.setLayerRenderInfo(layerRenderInfo);
    }
  }

  updateLayerData(layerInfo: ILayerInfo, layerData: ILayerData): void {
    const layer = this._layerManager.searchByLayerInfo(layerInfo);

    if (layer) {
      // load data
      layer.loadGeometry(layerData.geometry);
      layer.loadThematic(layerData.thematic);
    }
  }

  updateLayerThematic(layerInfo: ILayerInfo, layerThematic: ILayerThematic[]): void {
    const layer = this._layerManager.searchByLayerInfo(layerInfo);

    if (layer) {
      layer.loadThematic(layerThematic);
    }
  }

  render() {
    // Updates the camera
    this._camera.update();

    // Rnder loop
    this._renderer.clear();
    this._layerManager.layers.forEach((layer) => {
      layer.renderPass(this._camera);
    });

    // Refresh canvas
    requestAnimationFrame(this.render.bind(this));
  }
}
