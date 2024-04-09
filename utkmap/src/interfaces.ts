import { ColorHEX, LayerGeometryType, LayerPhysicalType, RenderStyle } from "./constants";

export interface IMapStyle {
    land : ColorHEX;
    roads: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    sky  : ColorHEX;
    surface  : ColorHEX;
    buildings: ColorHEX;
}

export interface ILayerData {
    id: string;                  // layer id
    type: LayerGeometryType;     // layer type
    physical: LayerPhysicalType; // layer physical type
    renderStyle: RenderStyle;    // render style
}