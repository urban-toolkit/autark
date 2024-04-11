import { ColorHEX, LayerGeometryType, LayerPhysicalType, RenderStyle, ThematicAggregationLevel } from "./constants";

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
    renderStyle: RenderStyle; // render style
    highlight?: boolean; // is highlighted?
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

