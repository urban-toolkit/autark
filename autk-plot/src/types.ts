
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { NormalizationMode, PlotEvent } from './constants';

export type PlotMargins = { left: number; right: number; top: number; bottom: number };

export type PlotHistogramConfig = {
    column: string;       // nested property path to the value (e.g. 'sjoin.avg.jun')
    numBins: number;      // number of equal-width bins
    divisor?: number;     // divide raw value before binning (e.g. 60 to convert min → h)
    labelSuffix?: string; // appended to each bin label (e.g. 'h')
};

export type PlotConfig = {
    div: HTMLElement,
    data: FeatureCollection<Geometry, GeoJsonProperties>,
    events: PlotEvent[],
    margins?: PlotMargins,
    width?: number,
    height?: number,
    labels?: { axis: string[]; title: string },
    attributes?: string[],
    histogram?: PlotHistogramConfig,
    tickFormats?: string[], // d3-format specifier per axis, e.g. ['.1f', '.4f']
    normalization?: { mode: NormalizationMode; lowerPercentile?: number; upperPercentile?: number };
}

export type PlotEventListener = (selection: number[]) => void;

export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];
