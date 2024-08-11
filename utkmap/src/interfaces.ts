import {
  ColorHEX,
  ColorMapInterpolator,
  LayerGeometryType,
  LayerPhysicalType,
  RenderPipeline,
  ThematicAggregationLevel,
} from './constants';

export interface IMapStyle {
  land: ColorHEX;
  roads: ColorHEX;
  parks: ColorHEX;
  water: ColorHEX;
  sky: ColorHEX;
  surface: ColorHEX;
  buildings: ColorHEX;
}

export interface ILayerInfo {
  id: string; // layer id
  zIndex: number; // layer render order
  typeGeometry: LayerGeometryType; // layer geometry type
  typePhysical: LayerPhysicalType; // layer physical type
}

export interface ILayerRenderInfo {
  pipeline: RenderPipeline; // render Pipeline
  isColorMap?: boolean; // is colormap enabled?
  colorMapInterpolator: ColorMapInterpolator; // used colormap
  isHighlight?: boolean; // is highlight enabled?
  highlightComps?: number[]; // what components?
  isPicking?: boolean; // is picking enabled?
}

export interface ILayerData {
  geometry: ILayerGeometry[]; // list of geometries
  thematic: ILayerThematic[]; // list of thematic data
}

export interface ILayerGeometry {
  position: number[]; // coordinate of the points
  normal?: number[]; // normals of the points
  indices?: number[]; // ids of the vertices
}

export interface ILayerThematic {
  level: ThematicAggregationLevel; // aggregation level
  values: number[]; // data values
}

export interface ICameraData {
  origin: number[];
  direction: {
    up: number[];
    eye: number[];
    lookAt: number[];
  };
}
