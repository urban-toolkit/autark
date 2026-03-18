
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { PlotEvent } from './constants';

export type PlotMargins = { left: number; right: number; top: number; bottom: number };

export type PlotConfig = {
    div: HTMLElement,
    data: FeatureCollection<Geometry, GeoJsonProperties>,
    events: PlotEvent[],
    margins?: PlotMargins,
    width?: number,
    height?: number,
    labels?: { axis: string[]; title: string },
    attributes?: string[],
}

export type PlotEventListener = (selection: number[]) => void;

export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];
