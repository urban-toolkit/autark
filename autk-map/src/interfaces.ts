import {
  ColorHEX,
  ColorMapInterpolator,
  LayerGeometryType,
  LayerType,
  RenderPipeline,
  ThematicAggregationLevel,
} from './constants';

/**
 * Interface for map styles.
 */
export interface IMapStyle {
  land: ColorHEX;
  roads: ColorHEX;
  parks: ColorHEX;
  water: ColorHEX;
  coastline: ColorHEX;
  sky: ColorHEX;
  surface: ColorHEX;
  buildings: ColorHEX;
  features: ColorHEX;
  lines: ColorHEX;
}

/**
 * Interface for layer information.
 */
export interface ILayerInfo {
  id: string;
  zIndex: number;
  typeGeometry: LayerGeometryType;
  typeLayer: LayerType;
}

/**
 * Interface for layer render information.
 */
export interface ILayerRenderInfo {
  pipeline: RenderPipeline;
  opacity: number;
  isColorMap?: boolean;
  colorMapInterpolator: ColorMapInterpolator;
  pickedComps?: number[];
  isSkip?: boolean;
  isPick?: boolean;
}

/**
 * Interface for layer border information.
 */
export interface ILayerData {
  border?: ILayerBorder[];
  geometry: ILayerGeometry[];
  components: ILayerComponent[];
  thematic?: ILayerThematic[];
  highlighted?: number[];
}

/**
 * Interface for layer geometry information.
 */
export interface ILayerGeometry {
  position: number[];
  normal?: number[];
  indices?: number[];
}

/**
 * Interface for layer border information.
 */
export interface ILayerBorder {
  position: number[];
  indices: number[];
}

/**
 * Interface for layer thematic data.
 */
export interface ILayerThematic {
  level: ThematicAggregationLevel;
  values: number[];
}

/**
 * Interface for layer components.
 */
export interface ILayerComponent {
  nPoints: number;
  nTriangles: number;
}

/**
 * Interface for camera data.
 */
export interface ICameraData {
  origin: number[];
  direction: {
    up: number[];
    eye: number[];
    lookAt: number[];
  };
}

/**
 * Interface for Bounding Box.
 */
export interface IBoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
