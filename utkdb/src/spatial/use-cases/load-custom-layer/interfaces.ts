import { FeatureCollection } from 'geojson';

export interface Params {
  geojsonFileUrl?: string;
  geojsonObject?: FeatureCollection;
  outputTableName: string;
  coordinateFormat?: string;
}
