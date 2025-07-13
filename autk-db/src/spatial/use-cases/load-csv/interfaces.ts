export interface Params {
  csvFileUrl?: string;
  csvObject?: unknown[][];
  outputTableName: string;
  delimiter?: string;
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
}

// TODO: create load-json
