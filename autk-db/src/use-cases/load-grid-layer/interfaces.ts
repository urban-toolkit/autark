import { BoundingBox } from '../../interfaces';

export interface LoadGridLayerParams {
  boundingBox?: BoundingBox;
  rows: number;
  columns: number;
  outputTableName: string;
  workspace?: string;
}
