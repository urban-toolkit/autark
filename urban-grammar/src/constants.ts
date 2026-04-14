export type LayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings' | 'points' | 'polygons' | 'polylines' | 'raster';

export type DataSourceType = 'osm' | 'csv' | 'json' | 'geojson' | 'heatmap' | 'join';

export enum ColorMapInterpolator {
  SEQUENTIAL_REDS = 'interpolateReds',
  SEQUENTIAL_BLUES = 'interpolateBlues',
  DIVERGING_RED_BLUE = 'interpolateRdBu',
  OBSERVABLE10 = 'schemeObservable10',
}

export type PlotMark = 'scatter' | 'bar' | 'line' | 'parallel-coordinates' | 'table';

export type PlotEvent = 'click' | 'brush' | 'brushY' | 'brushX';

export type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export enum NormalizationMode {
    MIN_MAX = 'minMax',
    PERCENTILE = 'percentile',
}