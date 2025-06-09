import { LayerType } from '../load-layer/interfaces';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  members?: {
    type: 'node' | 'way' | 'relation';
    ref: number;
    role?: string;
  }[];
  nodes?: number[];
}

export interface Params {
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  outputTableName: string;
  autoLoadLayers?: {
    coordinateFormat: string;
    dropOsmTable: boolean;
    layers: Array<LayerType>;
  };
}
