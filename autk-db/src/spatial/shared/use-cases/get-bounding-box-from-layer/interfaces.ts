import type { BoundingBox } from '../../../../shared/interfaces';

export interface GetBoundingBoxFromLayerParams {
  layerTableName: string;
  workspace?: string;
}

export type { BoundingBox };
