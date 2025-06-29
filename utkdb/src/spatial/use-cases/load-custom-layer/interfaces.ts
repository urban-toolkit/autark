import { FeatureCollection } from 'geojson';
import { BoundingBox } from '../../shared/use-cases/get-bounding-box/interfaces';

export interface Params {
  geojsonFileUrl?: string;
  geojsonObject?: FeatureCollection;
  outputTableName: string;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
}
