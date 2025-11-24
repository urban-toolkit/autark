export type LayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings' | 'points' | 'polygons' | 'polylines' | 'raster';

export type DataSourceType = 'osm' | 'csv' | 'json' | 'geojson';

export enum ColorMapInterpolator {
  SEQUENTIAL_REDS = 'interpolateReds',
  SEQUENTIAL_BLUES = 'interpolateBlues',
  DIVERGING_RED_BLUE = 'interpolateRdBu',
  OBSERVABLE10 = 'schemeObservable10',
}

export type PlotMark = 'bar' | 'line' | 'point';

export type PlotEvent = 'click' | 'brush' | 'brushY' | 'brushX';