export type LayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings' | 'points' | 'polygons' | 'polylines' | 'raster';

export type DataSourceType = 'osm' | 'csv' | 'json' | 'geojson' | 'heatmap' | 'join';

export enum ColorMapInterpolator {
  CAT_ACCENT = 'schemeAccent',
  CAT_DARK2 = 'schemeDark2',
  CAT_CATEGORY10 = 'schemeCategory10',
  CAT_OBSERVABLE10 = 'schemeObservable10',
  CAT_PAIRED = 'schemePaired',
  CAT_PASTEL1 = 'schemePastel1',
  CAT_PASTEL2 = 'schemePastel2',
  CAT_SET1 = 'schemeSet1',
  CAT_SET2 = 'schemeSet2',
  CAT_SET3 = 'schemeSet3',
  CAT_TABLEAU10 = 'schemeTableau10',
  SEQ_REDS = 'interpolateReds',
  SEQ_BLUES = 'interpolateBlues',
  SEQ_GREENS = 'interpolateGreens',
  SEQ_GREYS = 'interpolateGreys',
  SEQ_ORANGES = 'interpolateOranges',
  SEQ_PURPLES = 'interpolatePurples',
  SEQ_TURBO = 'interpolateTurbo',
  SEQ_VIRIDIS = 'interpolateViridis',
  SEQ_INFERNO = 'interpolateInferno',
  SEQ_MAGMA = 'interpolateMagma',
  SEQ_PLASMA = 'interpolatePlasma',
  SEQ_CIVIDIS = 'interpolateCividis',
  SEQ_WARM = 'interpolateWarm',
  SEQ_COOL = 'interpolateCool',
  SEQ_BU_GN = 'interpolateBuGn',
  SEQ_BU_PU = 'interpolateBuPu',
  SEQ_GN_BU = 'interpolateGnBu',
  SEQ_OR_RD = 'interpolateOrRd',
  SEQ_PU_BU = 'interpolatePuBu',
  SEQ_PU_RD = 'interpolatePuRd',
  SEQ_RD_PU = 'interpolateRdPu',
  SEQ_YL_GN = 'interpolateYlGn',
  SEQ_YL_OR_BR = 'interpolateYlOrBr',
  SEQ_YL_OR_RD = 'interpolateYlOrRd',
  DIV_BR_BG = 'interpolateBrBG',
  DIV_PR_GN = 'interpolatePRGn',
  DIV_PI_YG = 'interpolatePiYG',
  DIV_PU_OR = 'interpolatePuOr',
  DIV_RED_BLUE = 'interpolateRdBu',
  DIV_RED_GREY = 'interpolateRdGy',
  DIV_RED_YELLOW_BLUE = 'interpolateRdYlBu',
  DIV_RED_YELLOW_GREEN = 'interpolateRdYlGn',
  DIV_SPECTRAL = 'interpolateSpectral',
}

export type PlotMark = 'scatter' | 'bar' | 'line' | 'parallel-coordinates' | 'table';

export type PlotEvent = 'click' | 'brush' | 'brushY' | 'brushX';

export type AggregateFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted';

export enum NormalizationMode {
    MIN_MAX = 'minMax',
    PERCENTILE = 'percentile',
}