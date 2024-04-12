import { Color } from "d3-color";
import { ColorHEX, ColorMapInterpolator, ColorRGB, ColorTEX, LayerGeometryType, LayerPhysicalType, RenderPipeline, ThematicAggregationLevel } from "./constants";
import { ColorMap } from "./colormap";

export interface IMapStyle {
    land: ColorHEX;
    roads: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    sky: ColorHEX;
    surface: ColorHEX;
    buildings: ColorHEX;
}

export interface ILayerInfo {
    id: string; // layer id
    typeGeometry: LayerGeometryType; // layer geometry type
    typePhysical: LayerPhysicalType; // layer physical type
}

export interface ILayerRenderInfo {
    pipeline: RenderPipeline; // render Pipeline
    isColorMap?: boolean; // is colormap enabled?
    colorMapInterpolator: ColorMapInterpolator; // used colormap
    isHighlight?: boolean; // is highlight enabled?
    highlightComps?: number[]; // what components?
    isPicking?: boolean; // is picking enabled?
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
    level: ThematicAggregationLevel, // aggregation level
    values: Float32Array; // data values
}

export interface IShaderColorData {
    color: ColorRGB,     // fixed color used in the layer
    colorMap: ColorTEX   // colormap texture used to show thematic values
    isColorMap: boolean, // is colormap active? 
}

export interface ICameraData {
    origin: number[]; // camera position and look at
    direction: {
        up: number[]
        eye: number[],
        lookAt: number[],
    } // default: right: 0, 0, 1000. lookAt: 0, 0, 0. up: 0, 1, 0
}

