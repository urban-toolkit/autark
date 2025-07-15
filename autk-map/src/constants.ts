/**
 * Layer geometry types for the map.
 * @enum {string}
 * @property {string} FEATURES_2D - Represents 2D features.
 * @property {string} FEATURES_3D - Represents 3D features.
 * @property {string} BORDERS_2D  - Represents borders of 2D features.
 */
export enum LayerGeometryType {
  FEATURES_2D = 'features2d',
  FEATURES_3D = 'features3d',
  BORDERS_2D = 'borders2d'
}

/**
 * Layer types for the map.
 * @enum {string}
 * @property {string} OSM_SURFACE - Represents OpenStreetMap surface layer.
 * @property {string} OSM_COASTLINE - Represents OpenStreetMap coastline layer.
 * @property {string} OSM_PARKS - Represents OpenStreetMap parks layer.
 * @property {string} OSM_WATER - Represents OpenStreetMap water layer.
 * @property {string} OSM_ROADS - Represents OpenStreetMap roads layer.
 * @property {string} OSM_BUILDINGS - Represents OpenStreetMap buildings layer.
 * @property {string} CUSTOM_FEATURES_LAYER - Represents custom features layer.
 * @property {string} CUSTOM_LINES_LAYER - Represents custom lines layer.
 * @property {string} CUSTOM_GRID_LAYER - Represents custom grid layer.
 */
export enum LayerType {
  OSM_SURFACE = 'surface',
  OSM_COASTLINE = 'coastline',
  OSM_PARKS = 'parks',
  OSM_WATER = 'water',
  OSM_ROADS = 'roads',
  OSM_BUILDINGS = 'buildings',
  CUSTOM_FEATURES_LAYER  = 'features',
  CUSTOM_LINES_LAYER = 'lines',
  CUSTOM_GRID_LAYER  = 'grid',
}

/**
 * Layer Z-index values for rendering order.
 * @enum {number}
 * @property {number} OSM_SURFACE - Z-index for OpenStreetMap surface layer.
 * @property {number} OSM_COASTLINE - Z-index for OpenStreetMap coastline layer.
 * @property {number} OSM_PARKS - Z-index for OpenStreetMap parks layer.
 * @property {number} OSM_WATER - Z-index for OpenStreetMap water layer.
 * @property {number} OSM_ROADS - Z-index for OpenStreetMap roads layer.
 * @property {number} OSM_BUILDINGS - Z-index for OpenStreetMap buildings layer.
 * @property {number} CUSTOM_GRID_LAYER  - Z-index for custom grid layer.
 * @property {number} CUSTOM_FEATURES_LAYER - Z-index for custom features layer.
 * @property {number} CUSTOM_LINES_LAYER - Z-index for custom lines layer.
 */
export enum LayerZIndex {
  OSM_SURFACE = 0,
  OSM_COASTLINE = 0.1,
  OSM_PARKS = 0.2,
  OSM_WATER = 0.3,
  OSM_ROADS = 0.4,
  OSM_BUILDINGS = 1.0,
  CUSTOM_GRID_LAYER  = 0.5,
  CUSTOM_FEATURES_LAYER = 0.6,
  CUSTOM_LINES_LAYER = 0.7
}

/**
 * Map events for interaction.
 * @enum {string}
 * @property {string} PICK - Event triggered when a feature is picked.
 */
export enum MapEvent {
  PICK = 'pick',
}

/**
 * Thematic aggregation levels for thematic data.
 * @enum {string}
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
 * @enum {string}
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
 * @enum {string}
 * @property {string} INTERPOLATOR_REDS - Red color interpolation.
 * @property {string} INTERPOLATOR_BLUES - Blue color interpolation.
 */
export enum ColorMapInterpolator {
  INTERPOLATOR_REDS = 'interpolateReds',
  INTERPOLATOR_BLUES = 'interpolateBlues',
}

/**
 * Mouse status for interaction state.
 * @enum {string}
 * @property {string} MOUSE_IDLE - Mouse is idle.
 * @property {string} MOUSE_DRAG - Mouse is dragging.
 */
export enum MouseStatus {
  MOUSE_IDLE = 'mouseIdle',
  MOUSE_DRAG = 'mouseDrag',
}

/**
 * Color Hex type.
 * @typedef {string} ColorHEX
 * @description Represents a color in hexadecimal format, e.g., "#FF5733".
 */
export type ColorHEX = `#${string}`;

/**
 * Color RGB type.
 * @typedef {Object} ColorRGB
 * @property {number} r - Red component (0-255).
 * @property {number} g - Green component (0-255).
 * @property {number} b - Blue component (0-255).
 * @property {number} opacity - Opacity (0-1).
 */
export type ColorRGB = { r: number; g: number; b: number; opacity: number };

/**
 * Color TEX type.
 * @typedef {number[]} ColorTEX
 * @description Represents a color in texture format.
 */
export type ColorTEX = number[];

/**
 * Map event listener type.
 * @typedef {function} MapEventListener
 * @param {number[] | string[]} selection - The selected features or components.
 * @param {string} layerId - The ID of the layer associated with the event.
 * @returns {void}
 */
export type MapEventListener = (selection: number[] | string[], layerId: string) => void;
