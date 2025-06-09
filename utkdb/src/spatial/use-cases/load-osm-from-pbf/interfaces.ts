import { LayerType } from '../load-layer/interfaces';

export interface Params {
  pbfFileUrl: string;
  outputTableName: string;
  autoLoadLayers?: {
    coordinateFormat: string;
    dropOsmTable: boolean;
    layers: Array<LayerType>;
  };
}
