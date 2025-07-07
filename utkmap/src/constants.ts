export enum LayerGeometryType {
  FEATURES_2D = 'features2d',
  FEATURES_3D = 'features3d',
  BORDERS_2D = 'borders2d',
  HEATMAP_2D = 'heatmap2d',
}

export enum LayerType {
  OSM_SURFACE = 'surface',
  OSM_COASTLINE = 'coastline',
  OSM_PARKS = 'parks',
  OSM_WATER = 'water',
  OSM_ROADS = 'roads',
  OSM_BUILDINGS = 'buildings',
  //
  CUSTOM_POLYGONS_LAYER = 'polygons',
}

export enum LayerZIndex {
  OSM_SURFACE = 0,
  OSM_COASTLINE = 0.1,
  OSM_PARKS = 0.2,
  OSM_WATER = 0.3,
  OSM_ROADS = 0.4,
  OSM_BUILDINGS = 1.0,
  //
  CUSTOM_POLYGONS_LAYER = 0.5,
}

export enum MapEvent {
  PICK = 'pick',
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

// TODO move to types.ts
export type ColorHEX = `#${string}`;
export type ColorRGB = { r: number; g: number; b: number; opacity: number };
export type ColorTEX = number[];

export type MapEventListener = (selection: number[] | string[], layerId: string) => void;
