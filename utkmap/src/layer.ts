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

    protected _highlightedVertices!: number[];
    protected _highlightedIds!: Set<number>;

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

    get pickedComp() {
        return this.layerRenderInfo.pickedComps;
    }

    get highlightedIds(): number[] {
        return Array.from(this._highlightedIds);
    }

    get highlightedVertices(): number[] {
        return this._highlightedVertices;
    }

    setLayerInfo(layerInfo: ILayerInfo) {
        this._layerInfo = layerInfo;
    }

    setLayerRenderInfo(layerRenderInfo: ILayerRenderInfo) {
        this._layerRenderInfo = layerRenderInfo;
    }

    makeLayerDataInfoDirty() {
        this._dataInfoIsDirty = true;
    }

    makeLayerRenderInfoDirty() {
        this._renderInfoIsDirty = true;
    }

    clearHighlightedIds() {
        this._highlightedVertices.fill(0);
        this._highlightedIds.clear();

        this.makeLayerRenderInfoDirty();
        this.makeLayerDataInfoDirty();
    }

    abstract setHighlightedIds(ids: number[]): void;

    abstract loadData(layerData: ILayerData): void;

    abstract loadGeometry(layerGeometry: ILayerGeometry[]): void;

    abstract loadComponent(layerComponent: ILayerComponent[]): void;

    abstract loadThematic(layerThematic: ILayerThematic[]): void;

    abstract createPipeline(renderer: Renderer, camera: Camera): void;

    abstract renderPass(camera: Camera): void;

    abstract renderPickingPass(camera: Camera): void;

    abstract getPickedId(x: number, y: number): Promise<number>;
}
