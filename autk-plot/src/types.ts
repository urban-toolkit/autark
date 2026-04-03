import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { ColorHEX, ColorRGB, ColorTEX } from 'autk-core';
import type { LinechartConfig } from './plot-types/linechart';
import { ColorMapInterpolator, PlotEvent } from './constants';

export type { ColorHEX, ColorRGB, ColorTEX };

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
    events?: PlotEvent[],
    margins?: PlotMargins,
    width?: number,
    height?: number,
    labels?: { axis: string[]; title: string },
    attributes?: string[],
    histogram?: HistogramConfig,
    tickFormats?: string[], // d3-format specifier per axis, e.g. ['.1f', '.4f']
    /** Explicit data domain `[min, max]` for numerical color encoding. If omitted, computed from the data. */
    domain?: [number, number];
    colorMapInterpolator?: ColorMapInterpolator;
}

export type PlotSelectionPayload = { selection: number[] };

export type PlotEventListener = (event: PlotSelectionPayload) => void;

export type ChartType = 'scatterplot' | 'barchart' | 'parallel-coordinates' | 'table' | 'linechart';

type SharedChartConfig = Omit<PlotConfig, 'div'>;

export type ScatterplotChartConfig = SharedChartConfig & {
    type: 'scatterplot';
    attributes: [string, string];
};

export type BarchartChartConfig = SharedChartConfig & {
    type: 'barchart';
};

export type ParallelCoordinatesChartConfig = SharedChartConfig & {
    type: 'parallel-coordinates';
};

export type TableChartConfig = SharedChartConfig & {
    type: 'table';
};

export type LinechartUnifiedConfig = Omit<LinechartConfig, 'div'> & {
    type: 'linechart';
};

export type UnifiedChartConfig =
    | ScatterplotChartConfig
    | BarchartChartConfig
    | ParallelCoordinatesChartConfig
    | TableChartConfig
    | LinechartUnifiedConfig;
