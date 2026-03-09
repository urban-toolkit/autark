import type { AutarkProvenanceState } from '../types';
import { ProvenanceAction } from '../types';

export type DbRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

export interface IDbForProvenance {
  getCurrentWorkspace(): string;
  getWorkspaces(): string[];
  setWorkspace(name: string): Promise<void>;
  tables: Array<{ name: string }>;
}

export interface DbAdapterApi {
  recordWorkspace(name: string): void;
  recordLoadOsm(outputTableName: string): void;
  recordLoadCsv(outputTableName: string): void;
  recordLoadJson(outputTableName: string): void;
  recordLoadCustomLayer(outputTableName: string): void;
  recordLoadGridLayer(outputTableName: string): void;
  recordSpatialJoin(params: { tableRootName?: string; tableJoinName?: string }): void;
  recordUpdateTable(tableName: string): void;
  recordDropTable(tableName: string): void;
  applyState(state: AutarkProvenanceState): Promise<void>;
}

export function createDbAdapter(
  db: IDbForProvenance,
  onRecord: DbRecordCallback
): DbAdapterApi {
  function getCurrentLayerNames(): string[] {
    return (db.tables || []).map((t) => t.name);
  }

  function recordWorkspace(name: string): void {
    onRecord(ProvenanceAction.DB_WORKSPACE, `Workspace: ${name}`, {
      data: {
        workspace: name,
        layerTableNames: getCurrentLayerNames(),
      },
    });
  }

  function recordLoadOsm(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    onRecord(ProvenanceAction.DB_LOAD_OSM, `Load OSM: ${outputTableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  function recordLoadCsv(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    onRecord(ProvenanceAction.DB_LOAD_CSV, `Load CSV: ${outputTableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  function recordLoadJson(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    onRecord(ProvenanceAction.DB_LOAD_JSON, `Load JSON: ${outputTableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  function recordLoadCustomLayer(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    onRecord(ProvenanceAction.DB_LOAD_CUSTOM_LAYER, `Load custom layer: ${outputTableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  function recordLoadGridLayer(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    onRecord(ProvenanceAction.DB_LOAD_GRID_LAYER, `Load grid layer: ${outputTableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  function recordSpatialJoin(params: { tableRootName?: string; tableJoinName?: string }): void {
    const label = `Spatial join: ${params.tableRootName ?? '?'} + ${params.tableJoinName ?? '?'}`;
    onRecord(ProvenanceAction.DB_SPATIAL_JOIN, label, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: getCurrentLayerNames(),
      },
    });
  }

  function recordUpdateTable(tableName: string): void {
    onRecord(ProvenanceAction.DB_UPDATE_TABLE, `Update table: ${tableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: getCurrentLayerNames(),
      },
    });
  }

  function recordDropTable(tableName: string): void {
    const names = getCurrentLayerNames().filter((n) => n !== tableName);
    onRecord(ProvenanceAction.DB_DROP_TABLE, `Drop table: ${tableName}`, {
      data: {
        workspace: db.getCurrentWorkspace(),
        layerTableNames: names,
      },
    });
  }

  async function applyState(state: AutarkProvenanceState): Promise<void> {
    const data = state.data;
    if (!data?.workspace) return;
    const current = db.getCurrentWorkspace();
    if (current !== data.workspace) {
      await db.setWorkspace(data.workspace);
    }
  }

  return {
    recordWorkspace,
    recordLoadOsm,
    recordLoadCsv,
    recordLoadJson,
    recordLoadCustomLayer,
    recordLoadGridLayer,
    recordSpatialJoin,
    recordUpdateTable,
    recordDropTable,
    applyState,
  };
}

/**
 * Wraps a SpatialDb-like instance so that mutating methods automatically record provenance.
 * Use this when you want DB actions to be tracked without calling record* manually.
 * The wrapped db has the same interface as the original; pass it to createAutarkProvenance as db.
 */
export function createDbProvenanceWrapper<T extends IDbForProvenance>(
  db: T,
  onRecord: DbRecordCallback
): T {
  const adapter = createDbAdapter(db, onRecord);
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'setWorkspace') {
        return async function (name: string) {
          await (target as IDbForProvenance).setWorkspace(name);
          adapter.recordWorkspace(name);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}
