import {
  ColorHEX,
  ColorMapInterpolator,
  LayerGeometryType,
  LayerType,
  RenderPipeline,
  ThematicAggregationLevel,
} from './constants';

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

export interface ILayerInfo {
  id: string; // layer id
  zIndex: number; // layer render order
  typeGeometry: LayerGeometryType; // layer geometry type
  typeLayer: LayerType; // layer physical type
}

export interface ILayerRenderInfo {
  pipeline: RenderPipeline; // render Pipeline
  opacity: number; // layer opacity
  isColorMap?: boolean; // is colormap enabled?
  colorMapInterpolator: ColorMapInterpolator; // used colormap
  pickedComps?: number[];
  isSkip?: boolean; // skip render?
  isPick?: boolean; // picking enabled?
}

export interface ILayerData {
  border?: ILayerBorder[]; // list of borders
  geometry: ILayerGeometry[]; // list of geometries
  components: ILayerComponent[]; // list of components
  thematic?: ILayerThematic[]; // list of thematic data
  highlighted?: number[]; // list of highlight data (boolean)
}

export interface ILayerGeometry {
  position: number[]; // coordinate of the points
  normal?: number[]; // normals of the points
  indices?: number[]; // ids of the vertices
}

export interface ILayerBorder {
  position: number[]; // coordinates of the border points
  indices: number[]; // indices of the border points
}

export interface ILayerThematic {
  level: ThematicAggregationLevel; // aggregation level
  values: number[]; // data values
}

export interface ILayerComponent {
  nPoints: number;
  nTriangles: number;
}

export interface ICameraData {
  origin: number[];
  direction: {
    up: number[];
    eye: number[];
    lookAt: number[];
  };
}

export interface IBoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
