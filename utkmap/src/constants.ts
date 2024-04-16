export enum LayerGeometryType {
    POINTSET_LAYER = "POINTSET_LAYER",
    POLYLINE_LAYER = "POLYLINE_LAYER",
    TRIGMESH_LAYER = "TRIGMESH_LAYER",
    UNIFGRID_LAYER = "UNIFGRID_LAYER",
}

export enum LayerPhysicalType {
    LAND_LAYER  = "land",
    ROADS_LAYER = "roads",
    PARKS_LAYER = "parks",
    WATER_LAYER = "water",
    SKY_LAYER   = "sky",
    SURFACE_LAYER   = "surface",
    BUILDINGS_LAYER = "buildings",
}

export enum ThematicAggregationLevel {
    AGGREGATION_POINT = 'AGGREGATION_POINT',
    AGGREGATION_PRIMITIVE = 'AGGREGATION_PRIMITIVE',
    AGGREGATION_COMPONENT = 'AGGREGATION_COMPONENT'
}

export enum RenderPipeline {
    TRIANGLE_FLAT = "TRIANGLE_FLAT",
}

export enum ColorMapInterpolator {
    INTERPOLATOR_REDS  = 'interpolateReds',
    INTERPOLATOR_BLUES = 'interpolateBlues'
}

export enum MouseStatus {
    MOUSE_IDLE = "MOUSE_IDLE",
    MOUSE_DRAG = "MOUSE_DRAG"
}

export type ColorHEX = `#${string}`;
export type ColorRGB = {r: number, g: number, b:number, opacity: number}
export type ColorTEX = number[];