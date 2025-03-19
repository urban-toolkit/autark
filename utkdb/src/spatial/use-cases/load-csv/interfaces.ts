export interface Params {
  csvFileUrl: string;
  outputTableName: string;
  delimiter?: string;
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
}
