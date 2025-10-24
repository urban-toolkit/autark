/**
 * The types of layer supported in autk-map.
 * @property {string} AUTK_OSM_SURFACE - Represents the OpenStreetMap surface layer (it must be a feature collection of polygons).
 * @property {string} AUTK_OSM_PARKS - Represents the OpenStreetMap parks layer (it must be a feature collection of polygons).
 * @property {string} AUTK_OSM_WATER - Represents the OpenStreetMap water layer (it must be a feature collection of polygons).
 * @property {string} AUTK_OSM_ROADS - Represents the OpenStreetMap roads layer (it must be a feature collection of polylines).
 * @property {string} AUTK_OSM_BUILDINGS - Represents the OpenStreetMap buildings layer (it must be a feature collection of polygons).
 * @property {string} AUTK_GEO_POINTS - Represents a layer with points or multipoints.
 * @property {string} AUTK_GEO_POLYLINES - Represents a layer of linestrings or multilinestrings.
 * @property {string} AUTK_GEO_POLYGONS - Represents a layer of polygons or multipolygons.
 * @property {string} AUTK_RASTER - Represents a raster layer.
 */
export enum LayerType {
  AUTK_OSM_SURFACE = 'surface',
  AUTK_OSM_PARKS = 'parks',
  AUTK_OSM_WATER = 'water',
  AUTK_OSM_ROADS = 'roads',
  AUTK_OSM_BUILDINGS = 'buildings',
  AUTK_GEO_POINTS = 'points',
  AUTK_GEO_POLYLINES = 'lines',
  AUTK_GEO_POLYGONS = 'polygons',
  AUTK_RASTER = 'raster'
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
 * Color map interpolators for thematic data visualization.
 * @property {string} SEQUENTIAL_REDS - Red color interpolation.
 * @property {string} SEQUENTIAL_BLUES - Blue color interpolation.
 */
export enum ColorMapInterpolator {
  SEQUENTIAL_REDS = 'interpolateReds',
  SEQUENTIAL_BLUES = 'interpolateBlues',
  DIVERGING_RED_BLUE = 'interpolateRdBu',
  OBSERVABLE10 = 'schemeObservable10',
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
