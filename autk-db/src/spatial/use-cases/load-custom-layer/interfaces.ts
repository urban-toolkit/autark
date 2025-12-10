import { FeatureCollection } from 'geojson';
import { BoundingBox } from '../../../shared/interfaces';

export interface Params {
  geojsonFileUrl?: string;
  geojsonObject?: FeatureCollection;
  outputTableName: string;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
  workspace?: string;
}
