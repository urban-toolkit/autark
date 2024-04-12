import { ColorHEX, ColorMapInterpolators, LayerGeometryType, LayerPhysicalType, RenderPipeline, ThematicAggregationLevel } from "./constants";

export interface IMapStyle {
    land : ColorHEX;
    roads: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    sky  : ColorHEX;
    surface  : ColorHEX;
    buildings: ColorHEX;
}

export interface ILayerInfo {
    id: string; // layer id
    typeGeometry: LayerGeometryType; // layer geometry type
    typePhysical: LayerPhysicalType; // layer physical type
}

export interface ILayerRenderInfo {
    pipeline: RenderPipeline; // render Pipeline
    colorMapInterpolator: ColorMapInterpolators; // used colormap

    isColorMap?: boolean; // is colormap enabled?
    isPicking?: boolean; // is picking enabled?
    isHighlight?: boolean; // is highlight enabled?
    highlightComps?: number[]; // what components?
}

export interface ILayerData {
    geometry: ILayerGeometry[]; // list of geometries
    thematic: ILayerThematic[]; // list of thematic data
}

export interface ILayerGeometry {
    position: Float32Array;  // coordinate of the points
    normal?: Float32Array;   // normals of the points
    indices?: Uint16Array;   // ids of the vertices
}

export interface ILayerThematic {
    aggregation: ThematicAggregationLevel,
    values: Float32Array;
}

