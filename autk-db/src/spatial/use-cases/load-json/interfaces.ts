export interface Params {
  jsonFileUrl?: string;
  jsonObject?: unknown[];
  outputTableName: string;
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
  workspace?: string;
}
