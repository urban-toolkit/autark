import { ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';

import { Renderer } from './renderer';

export abstract class Layer {
    // layer id
    protected _info!: ILayerInfo;
    // picking shader
    protected _renderInfo!: ILayerRenderInfo;

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
        this.loadInfo(layerInfo);
        this.loadRenderInfo(layerRenderInfo);
    }

    get id() {
        return this._info.id;
    }

    get info() {
        return this._info;
    }

    get renderInfo() {
        return this._renderInfo;
    }

    loadInfo(layerInfo: ILayerInfo) {
        this._info = layerInfo;
    }

    loadRenderInfo(layerRenderInfo: ILayerRenderInfo) {
        this._renderInfo = layerRenderInfo;
    }

    abstract loadData(layerData: ILayerData): void;

    abstract loadGeometry(layerGeometry: ILayerGeometry[]): void;

    abstract loadThematic(layerThematic: ILayerThematic[]): void;

    abstract buildPipeline(renderer: Renderer): void;

    abstract setRenderPass(): void;
}