export enum LayerGeometryType {
    TRIGMESH_LAYER = 'TRIGMESH_LAYER',
    BUILDINGS_LAYER = 'BUILDINGS_LAYER',
    // TODO
    POINTSET_LAYER = 'POINTSET_LAYER',
    POLYLINE_LAYER = 'POLYLINE_LAYER',
    UNIFGRID_LAYER = 'UNIFGRID_LAYER',
}

export enum LayerType {
    PHYSICAL_SURFACE = 'surface',
    PHYSICAL_PARKS = 'parks',
    PHYSICAL_WATER = 'water',
    PHYSICAL_ROADS = 'roads',
    PHYSICAL_BUILDINGS = 'buildings',
    THEMATIC = 'thematic'
}

export enum ThematicAggregationLevel {
    AGGREGATION_POINT = 'AGGREGATION_POINT',
    AGGREGATION_PRIMITIVE = 'AGGREGATION_PRIMITIVE',
    AGGREGATION_COMPONENT = 'AGGREGATION_COMPONENT',
}

export enum RenderPipeline {
    TRIANGLE_FLAT = 'TRIANGLE_FLAT',
    BUILDING_FLAT = 'BUILDING_FLAT',
}

export enum ColorMapInterpolator {
    INTERPOLATOR_REDS = 'interpolateReds',
    INTERPOLATOR_BLUES = 'interpolateBlues',
}

export enum MouseStatus {
    MOUSE_IDLE = 'MOUSE_IDLE',
    MOUSE_DRAG = 'MOUSE_DRAG',
}

export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];
