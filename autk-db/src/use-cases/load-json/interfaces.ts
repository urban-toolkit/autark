export interface LoadJsonParams {
  jsonFileUrl?: string;
  jsonObject?: unknown[];
  outputTableName: string;
  /** Column names that contain lat/lng coordinates, and the CRS they are in. */
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
  workspace?: string;
}
