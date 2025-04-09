import { LayerType } from '../load-layer/interfaces';

export interface Params {
  pbfFileUrl: string;
  outputTableName: string;
  boudingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  autoLoadLayers?: {
    coordinateFormat: string;
    dropOsmTable: boolean;
    layers: Array<LayerType>;
  };
}
