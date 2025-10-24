import {
    ColorHEX,
    ColorMapInterpolator,
    LayerType,
    ThematicAggregationLevel,
} from './constants';

/**
 * Interface for map styles.
 * @property {ColorHEX} background - Color of the map's background.
 * @property {ColorHEX} surface - Color of the map's surface.
 * @property {ColorHEX} parks - Color of the map's parks.
 * @property {ColorHEX} water - Color of the map's water bodies.
 * @property {ColorHEX} roads - Color of the map's roads.
 * @property {ColorHEX} buildings - Color of the map's buildings.
 * @property {ColorHEX} features - Color of the map's features.
 * @property {ColorHEX} lines - Color of the map's lines.
 */
export interface IMapStyle {
    background: ColorHEX;
    surface: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    roads: ColorHEX;
    buildings: ColorHEX;
    points: ColorHEX;
    polylines: ColorHEX;
    polygons: ColorHEX;
}

/**
 * Interface for layer information.
 * @property {string} id - Unique identifier for the layer.
 * @property {number} zValue - Z-value of the layer for rendering order.
 * @property {LayerGeometryType} typeGeometry - Type of geometry used in the layer.
 * @property {LayerType} typeLayer - Type of layer.
 */
export interface ILayerInfo {
    id: string;
    zIndex: number;
    typeLayer: LayerType;
}

/**
 * Interface for layer render information.
 * @property {RenderPipeline} pipeline - Rendering pipeline used for the layer.
 * @property {number} opacity - Opacity of the layer.
 * @property {boolean} [isColorMap] - Indicates if the layer is a color map.
 * @property {ColorMapInterpolator} colorMapInterpolator - Interpolator for color mapping.
 * @property {number[]} [pickedComps] - Components that are picked, if any.
 * @property {boolean} [isSkip] - Indicates if the layer should be skipped in rendering.
 * @property {boolean} [isPick] - Indicates if the layer is for picking
 */
export interface ILayerRenderInfo {
    opacity: number;
    isColorMap?: boolean;
    colorMapInterpolator: ColorMapInterpolator;
    colorMapLabels: string[];
    pickedComps?: number[];
    isSkip?: boolean;
    isPick?: boolean;
}

/**
 * Interface for layer border information.
 * @property {ILayerGeometry[]} geometry - Array of geometries for the layer.
 * @property {ILayerComponent[]} components - Array of components for the layer.
 * @property {ILayerBorder[]} [border] - Array of borders for the layer.
 * @property {ILayerBorderComponent[]} [borderComponents] - Array of border components for the layer.
 * @property {IRasterData} [raster] - Raster data for the layer.
 * @property {ILayerThematic[]} [thematic] - Thematic data for the layer.
 * @property {number[]} [highlighted] - Indices of highlighted components in the layer.
 */
export interface ILayerData {
    geometry: ILayerGeometry[];
    components: ILayerComponent[];
    border?: ILayerBorder[];
    borderComponents?: ILayerBorderComponent[];
    raster?: IRasterData[];
    thematic?: ILayerThematic[];
    highlighted?: number[];
}

/**
 * Interface for layer geometry information.
 * @property {number[]} position - Array of positions for the geometry.
 * @property {number[]} [normal] - Optional array of normals for the geometry.
 * @property {number[]} [indices] - Optional array of indices for the geometry.
 * @property {number[]} [texCoord] - Optional array of texture coordinates for the geometry.
 */
export interface ILayerGeometry {
    position: number[];
    normal?: number[];
    indices?: number[];
    texCoord?: number[];
}

/**
 * Interface for layer thematic data.
 * @property {ThematicAggregationLevel} level - Thematic aggregation level.
 * @property {number[]} values - Array of values for the thematic layer.
 */
export interface ILayerThematic {
    level: ThematicAggregationLevel;
    values: number[];
}

/**
 * Interface for raster data.
 * @property {number} rasterResX - Width of the raster.
 * @property {number} rasterResY - Height of the raster.
 * @property {number[]} values - Array of raster values.
 */
export interface IRasterData {
    rasterResX: number;
    rasterResY: number;
    rasterValues: number[];
}

/**
 * Interface for layer components.
 * @property {number} nPoints - Number of points in the layer component.
 * @property {number} nTriangles - Number of triangles in the layer component.
 */
export interface ILayerComponent {
    nPoints: number;
    nTriangles: number;
}

/**
 * Interface for layer border information.
 * @property {number[]} position - Position of the border.
 * @property {number[]} indices - Indices of the border.
 */
export interface ILayerBorder {
    position: number[];
    indices: number[];
}

/**
 * Interface for layer border components.
 * @property {number[]} nPoints - Number of points in the layer component.
 * @property {number[]} nLines - Number of lines in the layer component.
 */
export interface ILayerBorderComponent {
    nPoints: number;
    nLines: number;
}

/**
 * Interface for camera data.
 * @property {number[]} up - Up vector of the camera.
 * @property {number[]} eye - Position of the camera.
 * @property {number[]} lookAt - Point the camera is looking at.
 */
export interface ICameraData {
    up: number[];
    eye: number[];
    lookAt: number[];
}
