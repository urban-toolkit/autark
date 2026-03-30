export enum ColorMapInterpolator {
    SEQUENTIAL_REDS = 'interpolateReds',
    SEQUENTIAL_BLUES = 'interpolateBlues',
}

export enum NormalizationMode {
    MIN_MAX = 'minMax',
    PERCENTILE = 'percentile',
}

export enum PlotEvent {
    CLICK = 'click',
    BRUSH = 'brush',
    BRUSH_Y = 'brushY',
    BRUSH_X = 'brushX'
}
