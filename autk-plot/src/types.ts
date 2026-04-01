import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { ColorHEX, ColorRGB, ColorTEX, NormalizationConfig } from 'autk-types';
import { PlotEvent } from './constants';

export type { ColorHEX, ColorRGB, ColorTEX, NormalizationConfig };

export type PlotMargins = { left: number; right: number; top: number; bottom: number };

export type HistogramConfig = {
    column: string;       // nested property path to the value (e.g. 'sjoin.avg.jun')
    numBins: number;      // number of equal-width bins
    divisor?: number;     // divide raw value before binning (e.g. 60 to convert min → h)
    labelSuffix?: string; // appended to each bin label (e.g. 'h')
};

export type PlotConfig = {
    div: HTMLElement,
    collection: FeatureCollection<Geometry, GeoJsonProperties>,
    events: PlotEvent[],
    margins?: PlotMargins,
    width?: number,
    height?: number,
    labels?: { axis: string[]; title: string },
    attributes?: string[],
    histogram?: HistogramConfig,
    tickFormats?: string[], // d3-format specifier per axis, e.g. ['.1f', '.4f']
    normalization?: NormalizationConfig;
}

export type PlotEventListener = (event: { selection: number[] }) => void;
