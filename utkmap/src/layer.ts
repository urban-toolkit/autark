import { Camera } from './camera';
import { ILayerComponent, ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Renderer } from './renderer';

export abstract class Layer {
    // layer id
    protected _layerInfo!: ILayerInfo;
    // picking shader
    protected _layerRenderInfo!: ILayerRenderInfo;
    // uniforms dirty
    protected _renderInfoIsDirty: boolean = false;
    // vbo is dirty
    protected _dataInfoIsDirty: boolean = false;

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
        this.setLayerInfo(layerInfo);
        this.setLayerRenderInfo(layerRenderInfo);
    }

    get id() {
        return this._layerInfo.id;
    }

    get layerInfo() {
        return this._layerInfo;
    }

    get layerRenderInfo() {
        return this._layerRenderInfo;
    }

    setLayerInfo(layerInfo: ILayerInfo) {
        this._layerInfo = layerInfo;
    }

    setLayerRenderInfo(layerRenderInfo: ILayerRenderInfo) {
        this._layerRenderInfo = layerRenderInfo;

        this.makeLayerRenderInfoDirty();
    }

    makeLayerDataInfoDirty() {
        this._dataInfoIsDirty = true;
    }

    makeLayerRenderInfoDirty() {
        this._renderInfoIsDirty = true;
    }

    abstract loadData(layerData: ILayerData): void;

    abstract loadGeometry(layerGeometry: ILayerGeometry[]): void;

    abstract loadComponent(layerComponent: ILayerComponent[]): void;

    abstract loadThematic(layerThematic: ILayerThematic[]): void;

    abstract createPipeline(renderer: Renderer, camera: Camera): void;

    abstract renderPass(camera: Camera): void;
}
