import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from './interfaces';

import Renderer from './renderer';

export default abstract class Layer {
    // layer id
    protected _info!: ILayerInfo;

    // picking shader
    protected _picking: boolean;

    constructor(layerInfo: ILayerInfo, picking: boolean) {
        this.loadInfo(layerInfo);
        this._picking = picking;
    }

    get id() {
        return this._info.id;
    }

    get info() {
        return this._info;
    }

    get picking() {
        return this._picking;
    }

    loadInfo(layerInfo: ILayerInfo) {
        this._info = layerInfo;
    }

    abstract loadData(layerData: ILayerData): void;

    abstract loadGeometry(layerGeometry: ILayerGeometry[]): void;

    abstract loadThematic(layerThematic: ILayerThematic[]): void;

    abstract buildPipeline(renderer: Renderer): void;

    abstract setRenderPass(): void;
}