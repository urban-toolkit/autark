import { GeoJsonProperties } from "geojson";

export enum PlotEvent {
    CLICK = 'click',
    BRUSH = 'brush',
}

export type PlotEventListener = (selection: number[] | string[]) => void;
export type D3PlotBuilder = (div: HTMLElement, d3DataKey: string, data: GeoJsonProperties[]) => any;