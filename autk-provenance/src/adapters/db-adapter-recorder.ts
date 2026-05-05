import { ProvenanceAction } from '../types';
import { bootstrapDbRecorder } from './db-adapter-bootstrap';
import type { DbRecordCallback, DbRecorderSet, DbStateSource } from './db-adapter-types';

export function createDbRecorderSet(db: DbStateSource, onRecord: DbRecordCallback): DbRecorderSet {
  const didBootstrap = { value: false };
  const getCurrentLayerNames = (): string[] => (db.tables || []).map((t) => t.name);
  const getWorkspaceSafe = (): string => {
    try {
      return db.getCurrentWorkspace();
    } catch {
      return 'main';
    }
  };
  const record = (actionType: string, actionLabel: string, layerTableNames: string[] = getCurrentLayerNames()) =>
    onRecord(actionType, actionLabel, { data: { workspace: getWorkspaceSafe(), layerTableNames } });
  const recordWithAddedTable = (actionType: string, prefix: string, outputTableName: string): void => {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(actionType, `${prefix}: ${outputTableName}`, names);
  };

  const recorder: DbRecorderSet = {
    getCurrentLayerNames,
    getWorkspaceSafe,
    bootstrapFromCurrentState: () => bootstrapDbRecorder(didBootstrap, db.tables || [], recorder),
    recordInit: () => record(ProvenanceAction.DB_INIT, 'Database initialized'),
    recordWorkspace: (name) =>
      onRecord(ProvenanceAction.DB_WORKSPACE, `Workspace: ${name}`, {
        data: { workspace: name, layerTableNames: getCurrentLayerNames() },
      }),
    recordLoadOsm: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_OSM, 'Load OSM', name),
    recordLoadCsv: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_CSV, 'Load CSV', name),
    recordLoadJson: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_JSON, 'Load JSON', name),
    recordLoadLayer: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_LAYER, 'Load layer', name),
    recordLoadCustomLayer: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_CUSTOM_LAYER, 'Load custom layer', name),
    recordLoadGridLayer: (name) => recordWithAddedTable(ProvenanceAction.DB_LOAD_GRID_LAYER, 'Load grid layer', name),
    recordGetLayer: (name) => record(ProvenanceAction.DB_GET_LAYER, `Get layer: ${name}`),
    recordSpatialJoin: (params) =>
      record(ProvenanceAction.DB_SPATIAL_JOIN, `Spatial join: ${params.tableRootName ?? '?'} + ${params.tableJoinName ?? '?'}`),
    recordUpdateTable: (name) => record(ProvenanceAction.DB_UPDATE_TABLE, `Update table: ${name}`),
    recordDropTable: (name) =>
      record(ProvenanceAction.DB_DROP_TABLE, `Drop table: ${name}`, getCurrentLayerNames().filter((n) => n !== name)),
    recordRawQuery: (label = 'Raw query executed') => record(ProvenanceAction.DB_RAW_QUERY, label),
    recordBuildHeatmap: (name) => recordWithAddedTable(ProvenanceAction.DB_BUILD_HEATMAP, 'Build heatmap', name),
  };

  return recorder;
}
