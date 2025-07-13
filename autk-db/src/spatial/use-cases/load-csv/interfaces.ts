export interface Params {
  csvFileUrl: string;
  // TODO: receive an array
  outputTableName: string;
  delimiter?: string;
  geometryColumns?: { latColumnName: string; longColumnName: string; coordinateFormat?: string };
}

// TODO: create load-json
