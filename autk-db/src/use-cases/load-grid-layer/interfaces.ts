import type { BoundingBox } from '../../types-core';

export interface LoadGridLayerParams {
  boundingBox?: BoundingBox;
  rows: number;
  columns: number;
  outputTableName: string;
  workspace?: string;
}
