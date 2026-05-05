import { ProvenanceAction } from '../../types';
import type { DbRecordCallback, DbTableLike, IDbForProvenance } from './types';
import { appendLayerName, getCurrentLayerNames, getWorkspaceSafe } from './utils';

export interface DbRecorder {
  bootstrapFromCurrentState(): void;
  recordInit(): void;
  recordWorkspace(name: string): void;
  recordLoadOsm(name: string): void;
  recordLoadCsv(name: string): void;
  recordLoadJson(name: string): void;
  recordLoadLayer(name: string): void;
  recordLoadCustomLayer(name: string): void;
  recordLoadGridLayer(name: string): void;
  recordGetLayer(name: string): void;
  recordSpatialJoin(params: { tableRootName?: string; tableJoinName?: string }): void;
  recordUpdateTable(name: string): void;
  recordDropTable(name: string): void;
  recordRawQuery(label?: string): void;
  recordBuildHeatmap(name: string): void;
}

export function createDbRecorder(db: IDbForProvenance, onRecord: DbRecordCallback): DbRecorder {
  let didBootstrap = false;
  const record = (actionType: ProvenanceAction, label: string, names = getCurrentLayerNames(db)) => {
    onRecord(actionType, label, { data: { workspace: getWorkspaceSafe(db), layerTableNames: names } });
  };
  const recordLoad = (actionType: ProvenanceAction, prefix: string, name: string) => {
    record(actionType, `${prefix}: ${name}`, appendLayerName(getCurrentLayerNames(db), name));
  };

  const recorder: DbRecorder = {
    bootstrapFromCurrentState: () => {
      if (didBootstrap) return;
      didBootstrap = true;
      recorder.recordInit();
      recorder.recordWorkspace(getWorkspaceSafe(db));
      (db.tables || []).forEach((table) => recordTableBySource(table, recorder, record));
    },
    recordInit: () => record(ProvenanceAction.DB_INIT, 'Database initialized'),
    recordWorkspace: (name) => onRecord(ProvenanceAction.DB_WORKSPACE, `Workspace: ${name}`, { data: { workspace: name, layerTableNames: getCurrentLayerNames(db) } }),
    recordLoadOsm: (name) => recordLoad(ProvenanceAction.DB_LOAD_OSM, 'Load OSM', name),
    recordLoadCsv: (name) => recordLoad(ProvenanceAction.DB_LOAD_CSV, 'Load CSV', name),
    recordLoadJson: (name) => recordLoad(ProvenanceAction.DB_LOAD_JSON, 'Load JSON', name),
    recordLoadLayer: (name) => recordLoad(ProvenanceAction.DB_LOAD_LAYER, 'Load layer', name),
    recordLoadCustomLayer: (name) => recordLoad(ProvenanceAction.DB_LOAD_CUSTOM_LAYER, 'Load custom layer', name),
    recordLoadGridLayer: (name) => recordLoad(ProvenanceAction.DB_LOAD_GRID_LAYER, 'Load grid layer', name),
    recordGetLayer: (name) => record(ProvenanceAction.DB_GET_LAYER, `Get layer: ${name}`),
    recordSpatialJoin: (params) => record(ProvenanceAction.DB_SPATIAL_JOIN, `Spatial join: ${params.tableRootName ?? '?'} + ${params.tableJoinName ?? '?'}`),
    recordUpdateTable: (name) => record(ProvenanceAction.DB_UPDATE_TABLE, `Update table: ${name}`),
    recordDropTable: (name) => record(ProvenanceAction.DB_DROP_TABLE, `Drop table: ${name}`, getCurrentLayerNames(db).filter((table) => table !== name)),
    recordRawQuery: (label = 'Raw query executed') => record(ProvenanceAction.DB_RAW_QUERY, label),
    recordBuildHeatmap: (name) => recordLoad(ProvenanceAction.DB_BUILD_HEATMAP, 'Build heatmap', name),
  };

  return recorder;
}

function recordTableBySource(
  table: DbTableLike,
  recorder: DbRecorder,
  record: (actionType: ProvenanceAction, label: string) => void
): void {
  switch (table.source) {
    case 'csv': return recorder.recordLoadCsv(table.name);
    case 'json': return recorder.recordLoadJson(table.name);
    case 'osm': return table.type === 'pointset' ? recorder.recordLoadOsm(table.name) : recorder.recordLoadLayer(table.name);
    case 'geojson': return recorder.recordLoadCustomLayer(table.name);
    case 'user': return table.type === 'pointset' ? record(ProvenanceAction.DB_OTHER, `User table: ${table.name}`) : recorder.recordLoadGridLayer(table.name);
    default: return record(ProvenanceAction.DB_OTHER, `Table available: ${table.name}`);
  }
}
