export enum LayerGeometryType {
    FEATURES_2D = 'features2d',
    FEATURES_3D = 'features3d',
}

export enum LayerType {
    OSM_SURFACE = 'surface',
    OSM_COASTLINE = 'coastline',
    OSM_PARKS = 'parks',
    OSM_WATER = 'water',
    OSM_ROADS = 'roads',
    OSM_BUILDINGS = 'buildings',
    //
    CUSTOM_LAYER = 'geojson',
}

export enum ThematicAggregationLevel {
    AGGREGATION_POINT = 'aggreagationPoint',
    AGGREGATION_PRIMITIVE = 'aggregationPrimitive',
    AGGREGATION_COMPONENT = 'aggregationComponent',
}

export enum RenderPipeline {
    TRIANGLE_FLAT = 'triangleFlat',
    TRIANGLE_SSAO = 'triangleSsao',
}

export enum ColorMapInterpolator {
    INTERPOLATOR_REDS = 'interpolateReds',
    INTERPOLATOR_BLUES = 'interpolateBlues',
}

export enum MouseStatus {
    MOUSE_IDLE = 'mouseIdle',
    MOUSE_DRAG = 'mouseDrag',
}

export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];
