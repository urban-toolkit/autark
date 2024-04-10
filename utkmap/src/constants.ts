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

export enum RenderStyle {
    INDEX_FLAT = "INDEX_FLAT",
    INDEX_FLAT_MAP = "INDEX_FLAT_MAP",
    INDEX_SMOOTH = "INDEX_SMOOTH",
    INDEX_SMOOTH_MAP = "INDEX_SMOOTH_MAP",
}

export enum ColorMapInterpolators {
    INTERPOLATE_REDS  = 'interpolateReds',
    INTERPOLATE_BLUES = 'interpolateBlues'
}

export type ColorHEX = `#${string}`;