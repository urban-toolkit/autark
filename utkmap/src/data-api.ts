import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from "./interfaces";

export abstract class DataApi {

    abstract loadLayer(layerInfo: ILayerInfo, layerData: ILayerData): void;

    abstract updateLayer(layerInfo: ILayerInfo, layerData: ILayerData): void;

    abstract updateLayerThematic(layerInfo: ILayerInfo, layerThematic: ILayerThematic[]): void;

}