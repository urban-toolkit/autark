import { GeoJsonProperties } from "geojson";

export enum PlotEvent {
    CLICK = 'click',
    BRUSH = 'brush',
}

export type PlotEventListener = (selection: number[] | string[] | GeoJsonProperties[]) => void;
export type D3PlotBuilder = (div: HTMLElement, data: GeoJsonProperties[]) => any;