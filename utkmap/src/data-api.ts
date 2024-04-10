import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from "./interfaces";

export abstract class DataApi {

    abstract loadLayer(layerInfo: ILayerInfo, layerData: ILayerData): void;

    abstract updateLayerGeometry(layerGeometry: ILayerGeometry): void;

    abstract updateLayerThematic(layerThematic: ILayerThematic): void;

}