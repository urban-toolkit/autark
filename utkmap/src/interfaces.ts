import { ColorHEX } from "./constants";

export interface IMapStyle {
    land : ColorHEX;
    roads: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    sky  : ColorHEX;
    surface  : ColorHEX;
    buildings: ColorHEX;
}