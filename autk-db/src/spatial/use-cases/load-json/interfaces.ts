export interface LoadJsonParams {
  jsonFileUrl?: string;
  jsonObject?: unknown[];
  outputTableName: string;
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
  workspace?: string;
}
