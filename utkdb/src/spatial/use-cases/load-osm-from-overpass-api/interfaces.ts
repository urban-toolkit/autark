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

export interface FormattedOsmNode {
  kind: 'node';
  id: number;
  tags: Record<string, string> | null;
  refs: null;
  lat: number;
  lon: number;
  ref_roles: null;
  ref_types: null;
}

export interface FormattedOsmWay {
  kind: 'way';
  id: number;
  tags: Record<string, string> | null;
  refs: number[];
  lat: null;
  lon: null;
  ref_roles: null;
  ref_types: null;
}

export interface FormattedOsmRelation {
  kind: 'relation';
  id: number;
  tags: Record<string, string> | null;
  refs: number[];
  lat: null;
  lon: null;
  ref_roles: string[];
  ref_types: ('node' | 'way' | 'relation')[];
}
