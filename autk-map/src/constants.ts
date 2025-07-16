/**
 * The types of geometry supported in autk-map.
 * @property {string} FEATURES_2D - Represents a 2D triangulation.
 * @property {string} FEATURES_3D - Represents a 3D triangulation.
 * @property {string} BOUNDARIES_2D - Represents a 2D triangulation with boundaries.
 */
export enum LayerGeometryType {
  TRIANGLES_2D = 'triangles2d',
  TRIANGLES_3D = 'triangles3d',
  BOUNDARIES_2D = 'boundaries2d'
}

/**
 * The types of layer supported in autk-map.
 * @property {string} OSM_SURFACE - Represents the OpenStreetMap surface layer.
 * @property {string} OSM_COASTLINE - Represents the OpenStreetMap coastline layer.
 * @property {string} OSM_PARKS - Represents the OpenStreetMap parks layer.
 * @property {string} OSM_WATER - Represents the OpenStreetMap water layer.
 * @property {string} OSM_ROADS - Represents the OpenStreetMap roads layer.
 * @property {string} OSM_BUILDINGS - Represents the OpenStreetMap buildings layer.
 * @property {string} BOUNDARIES_LAYER - Represents a layer with closed linestrings, multilinestrings, polygons, or multipolygons.
 * @property {string} POLYLINES_LAYER - Represents a layer of open linestrings or multilinestrings.
 * @property {string} HEATMAP_LAYER - Represents a heatmap layer.
 */
export enum LayerType {
  OSM_SURFACE = 'surface',
  OSM_COASTLINE = 'coastline',
  OSM_PARKS = 'parks',
  OSM_WATER = 'water',
  OSM_ROADS = 'roads',
  OSM_BUILDINGS = 'buildings',
  BOUNDARIES_LAYER  = 'boundaries',
  POLYLINES_LAYER = 'lines',
  HEATMAP_LAYER  = 'heatmap',
}

/**
 * Rendering order of the layers based on their type.
 * @property {string} OSM_SURFACE - Represents the OpenStreetMap surface layer.
 * @property {string} OSM_COASTLINE - Represents the OpenStreetMap coastline layer.
 * @property {string} OSM_PARKS - Represents the OpenStreetMap parks layer.
 * @property {string} OSM_WATER - Represents the OpenStreetMap water layer.
 * @property {string} OSM_ROADS - Represents the OpenStreetMap roads layer.
 * @property {string} OSM_BUILDINGS - Represents the OpenStreetMap buildings layer.
 * @property {string} BOUNDARIES_LAYER - Represents a layer with closed linestrings, multilinestrings, polygons, or multipolygons.
 * @property {string} POLYLINES_LAYER - Represents a layer of open linestrings or multilinestrings.
 * @property {string} HEATMAP_LAYER - Represents a heatmap layer.
 */
export enum LayerRenderOrder {
  OSM_SURFACE = 0,
  OSM_COASTLINE = 0.1,
  OSM_PARKS = 0.2,
  OSM_WATER = 0.3,
  OSM_ROADS = 0.4,
  OSM_BUILDINGS = 1.0,
  BOUNDARIES_LAYER = 0.6,
  POLYLINES_LAYER = 0.7,
  HEATMAP_LAYER  = 0.5
}

/**
 * Map events for interaction.
 * @property {string} PICK - Event triggered when a feature is picked.
 */
export enum MapEvent {
  PICK = 'pick',
}

/**
 * Thematic aggregation levels for thematic data.
 * @property {string} AGGREGATION_POINT - Represents aggregation at the point level.
 * @property {string} AGGREGATION_PRIMITIVE - Represents aggregation at the primitive level.
 * @property {string} AGGREGATION_COMPONENT - Represents aggregation at the component level.
 */
export enum ThematicAggregationLevel {
  AGGREGATION_POINT = 'aggregationPoint',
  AGGREGATION_PRIMITIVE = 'aggregationPrimitive',
  AGGREGATION_COMPONENT = 'aggregationComponent',
}

/**
 * Render pipelines for different rendering techniques.
 * @property {string} TRIANGLE_FLAT - Flat triangle rendering.
 * @property {string} TRIANGLE_SSAO - Screen Space Ambient Occlusion triangle rendering.
 * @property {string} TRIANGLE_HEATMAP - Heatmap triangle rendering.
 */
export enum RenderPipeline {
  TRIANGLE_FLAT = 'triangleFlat',
  TRIANGLE_SSAO = 'triangleSsao',
  TRIANGLE_HEATMAP = 'triangleHeatmap',
}

/**
 * Color map interpolators for thematic data visualization.
 * @property {string} INTERPOLATOR_REDS - Red color interpolation.
 * @property {string} INTERPOLATOR_BLUES - Blue color interpolation.
 */
export enum ColorMapInterpolator {
  INTERPOLATOR_REDS = 'interpolateReds',
  INTERPOLATOR_BLUES = 'interpolateBlues',
}

/**
 * Mouse status for interaction state.
 * @property {string} MOUSE_IDLE - Mouse is idle.
 * @property {string} MOUSE_DRAG - Mouse is dragging.
 */
export enum MouseStatus {
  MOUSE_IDLE = 'mouseIdle',
  MOUSE_DRAG = 'mouseDrag',
}

/**
 * Represents a color in hexadecimal format.
 * @example "#FF5733"
 */
export type ColorHEX = `#${string}`;

/**
 * Represents a color in RGB format, with red, green, blue components and an opacity.
 * @property {number} r - Red component. Value must be between 0 and 255.
 * @property {number} g - Green component. Value must be between 0 and 255.
 * @property {number} b - Blue component. Value must be between 0 and 255.
 * @property {number} opacity - Opacity. Value must be between
 * @example { r: 255, g: 87, b: 51, opacity: 1 }
 */
export type ColorRGB = { 
    r: number; 
    g: number; 
    b: number; 
    opacity: number 
};

/**
 * Represents a texture of colors as an array of numbers. 
 * Each group of four numbers represents a color in RGBA format.
 * @example [255, 87, 51, 1, 236, 12, 34, 0.8, ...]
 */
export type ColorTEX = number[];

/**
 * Map event listener type.
 * @param {number[] | string[]} selection - The selected features or components.
 * @param {string} layerId - The ID of the layer associated with the event.
 */
export type MapEventListener = (
    selection: number[] | string[],
    layerId: string
) => void;
