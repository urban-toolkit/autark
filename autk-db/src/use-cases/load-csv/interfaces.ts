export interface LoadCsvParams {
  csvFileUrl?: string;
  csvObject?: unknown[][];
  outputTableName: string;
  delimiter?: string;
  /** Column names that contain lat/lng coordinates, and the CRS they are in. */
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
  workspace?: string;
}

// TODO: create load-json
