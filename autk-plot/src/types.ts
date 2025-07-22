
import type { GeoJsonProperties } from 'geojson';

export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];

export type PlotEventListener = (selection: unknown[]) => void;
export type D3PlotBuilder = (div: HTMLElement, data: GeoJsonProperties[]) => void;