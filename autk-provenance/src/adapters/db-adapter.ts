import type { AutarkProvenanceState } from '../types';
import { ProvenanceAction } from '../types';

export type DbRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

type DbTableLike = {
  name: string;
  source?: string;
  type?: string;
};

export interface IDbForProvenance {
  getCurrentWorkspace(): string;
  getWorkspaces?(): string[];
  setWorkspace(name: string): Promise<void>;
  tables: DbTableLike[];
  init?(): Promise<void>;
  loadOsmFromOverpassApi?(params: { outputTableName?: string }): Promise<unknown>;
  loadCsv?(params: { outputTableName?: string }): Promise<unknown>;
  loadJson?(params: { outputTableName?: string }): Promise<unknown>;
  loadLayer?(params: { layer?: string; outputTableName?: string }): Promise<unknown>;
  loadCustomLayer?(params: { outputTableName?: string }): Promise<unknown>;
  loadGridLayer?(params: { outputTableName?: string }): Promise<unknown>;
  getLayer?(layerTableName: string): Promise<unknown>;
  spatialJoin?(params: { tableRootName?: string; tableJoinName?: string }): Promise<unknown>;
  updateTable?(params: { tableName?: string }): Promise<unknown>;
  rawQuery?(params: { output?: { type?: string } }): Promise<unknown>;
  buildHeatmap?(params: { outputTableName?: string }): Promise<unknown>;
}

export interface DbAdapterApi {
  startRecording(): void;
  stopRecording(): void;
  bootstrapFromCurrentState(): void;
  recordInit(): void;
  recordWorkspace(name: string): void;
  recordLoadOsm(outputTableName: string): void;
  recordLoadCsv(outputTableName: string): void;
  recordLoadJson(outputTableName: string): void;
  recordLoadLayer(outputTableName: string): void;
  recordLoadCustomLayer(outputTableName: string): void;
  recordLoadGridLayer(outputTableName: string): void;
  recordGetLayer(outputTableName: string): void;
  recordSpatialJoin(params: { tableRootName?: string; tableJoinName?: string }): void;
  recordUpdateTable(tableName: string): void;
  recordDropTable(tableName: string): void;
  recordRawQuery(label?: string): void;
  recordBuildHeatmap(outputTableName: string): void;
  applyState(state: AutarkProvenanceState): Promise<void>;
}

function inferName(result: unknown, fallback = 'table'): string {
  if (result && typeof result === 'object' && 'name' in result) {
    const maybeName = (result as { name?: unknown }).name;
    if (typeof maybeName === 'string' && maybeName.trim().length > 0) return maybeName;
  }
  return fallback;
}

function isFn(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function createDbAdapter(
  db: IDbForProvenance,
  onRecord: DbRecordCallback
): DbAdapterApi {
  const dbObj = db as unknown as Record<string, unknown>;
  const originalMethods = new Map<string, unknown>();
  let isRecording = false;
  let isApplyingState = false;
  let didBootstrap = false;

  function getCurrentLayerNames(): string[] {
    return (db.tables || []).map((t) => t.name);
  }

  function getWorkspaceSafe(): string {
    try {
      return db.getCurrentWorkspace();
    } catch {
      return 'main';
    }
  }

  function record(
    actionType: ProvenanceAction | string,
    actionLabel: string,
    layerTableNames: string[] = getCurrentLayerNames()
  ): void {
    onRecord(actionType, actionLabel, {
      data: {
        workspace: getWorkspaceSafe(),
        layerTableNames,
      },
    });
  }

  function recordInit(): void {
    record(ProvenanceAction.DB_INIT, 'Database initialized');
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
    record(ProvenanceAction.DB_LOAD_OSM, `Load OSM: ${outputTableName}`, names);
  }

  function recordLoadCsv(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_LOAD_CSV, `Load CSV: ${outputTableName}`, names);
  }

  function recordLoadJson(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_LOAD_JSON, `Load JSON: ${outputTableName}`, names);
  }

  function recordLoadLayer(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_LOAD_LAYER, `Load layer: ${outputTableName}`, names);
  }

  function recordLoadCustomLayer(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_LOAD_CUSTOM_LAYER, `Load custom layer: ${outputTableName}`, names);
  }

  function recordLoadGridLayer(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_LOAD_GRID_LAYER, `Load grid layer: ${outputTableName}`, names);
  }

  function recordGetLayer(outputTableName: string): void {
    record(ProvenanceAction.DB_GET_LAYER, `Get layer: ${outputTableName}`);
  }

  function recordSpatialJoin(params: { tableRootName?: string; tableJoinName?: string }): void {
    const label = `Spatial join: ${params.tableRootName ?? '?'} + ${params.tableJoinName ?? '?'}`;
    record(ProvenanceAction.DB_SPATIAL_JOIN, label);
  }

  function recordUpdateTable(tableName: string): void {
    record(ProvenanceAction.DB_UPDATE_TABLE, `Update table: ${tableName}`);
  }

  function recordDropTable(tableName: string): void {
    const names = getCurrentLayerNames().filter((n) => n !== tableName);
    record(ProvenanceAction.DB_DROP_TABLE, `Drop table: ${tableName}`, names);
  }

  function recordRawQuery(label = 'Raw query executed'): void {
    record(ProvenanceAction.DB_RAW_QUERY, label);
  }

  function recordBuildHeatmap(outputTableName: string): void {
    const names = getCurrentLayerNames();
    if (!names.includes(outputTableName)) names.push(outputTableName);
    record(ProvenanceAction.DB_BUILD_HEATMAP, `Build heatmap: ${outputTableName}`, names);
  }

  function recordTableBySource(table: DbTableLike): void {
    switch (table.source) {
      case 'csv':
        recordLoadCsv(table.name);
        return;
      case 'json':
        recordLoadJson(table.name);
        return;
      case 'osm':
        if (table.type === 'pointset') recordLoadOsm(table.name);
        else recordLoadLayer(table.name);
        return;
      case 'geojson':
        recordLoadCustomLayer(table.name);
        return;
      case 'user':
        if (table.type === 'pointset') {
          record(ProvenanceAction.DB_OTHER, `User table: ${table.name}`);
        } else {
          recordLoadGridLayer(table.name);
        }
        return;
      default:
        record(ProvenanceAction.DB_OTHER, `Table available: ${table.name}`);
    }
  }

  function bootstrapFromCurrentState(): void {
    if (didBootstrap) return;
    didBootstrap = true;

    recordInit();
    recordWorkspace(getWorkspaceSafe());
    for (const table of db.tables || []) {
      recordTableBySource(table);
    }
  }

  function wrapAsyncMethod(
    methodName: string,
    onAfter: (args: unknown[], result: unknown) => void
  ): void {
    const current = dbObj[methodName];
    if (!isFn(current) || originalMethods.has(methodName)) return;
    const original = current;
    originalMethods.set(methodName, original);

    dbObj[methodName] = async function (...args: unknown[]) {
      const result = await (original as (...a: unknown[]) => unknown).apply(this, args);
      if (isRecording && !isApplyingState) {
        onAfter(args, result);
      }
      return result;
    };
  }

  function restoreWrappedMethods(): void {
    for (const [methodName, original] of originalMethods.entries()) {
      dbObj[methodName] = original;
    }
    originalMethods.clear();
  }

  function startRecording(): void {
    if (isRecording) return;
    isRecording = true;

    bootstrapFromCurrentState();

    wrapAsyncMethod('init', () => {
      recordInit();
    });
    wrapAsyncMethod('setWorkspace', (args) => {
      const [name] = args;
      recordWorkspace(typeof name === 'string' ? name : getWorkspaceSafe());
    });
    wrapAsyncMethod('loadOsmFromOverpassApi', (args) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordLoadOsm(params.outputTableName ?? 'osm');
    });
    wrapAsyncMethod('loadCsv', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordLoadCsv(params.outputTableName ?? inferName(result, 'csv'));
    });
    wrapAsyncMethod('loadJson', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordLoadJson(params.outputTableName ?? inferName(result, 'json'));
    });
    wrapAsyncMethod('loadLayer', (args, result) => {
      const params = (args[0] ?? {}) as { layer?: string; outputTableName?: string };
      recordLoadLayer(params.outputTableName ?? params.layer ?? inferName(result, 'layer'));
    });
    wrapAsyncMethod('loadCustomLayer', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordLoadCustomLayer(params.outputTableName ?? inferName(result, 'custom-layer'));
    });
    wrapAsyncMethod('loadGridLayer', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordLoadGridLayer(params.outputTableName ?? inferName(result, 'grid-layer'));
    });
    wrapAsyncMethod('getLayer', (args) => {
      const [tableName] = args;
      recordGetLayer(typeof tableName === 'string' ? tableName : 'layer');
    });
    wrapAsyncMethod('spatialJoin', (args) => {
      const params = (args[0] ?? {}) as { tableRootName?: string; tableJoinName?: string };
      recordSpatialJoin(params);
    });
    wrapAsyncMethod('updateTable', (args, result) => {
      const params = (args[0] ?? {}) as { tableName?: string };
      recordUpdateTable(params.tableName ?? inferName(result, 'table'));
    });
    wrapAsyncMethod('rawQuery', (args) => {
      const params = (args[0] ?? {}) as { output?: { type?: string } };
      const label = params.output?.type === 'CREATE_TABLE'
        ? 'Raw query created table'
        : 'Raw query executed';
      recordRawQuery(label);
    });
    wrapAsyncMethod('buildHeatmap', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recordBuildHeatmap(params.outputTableName ?? inferName(result, 'heatmap'));
    });
  }

  function stopRecording(): void {
    if (!isRecording) return;
    isRecording = false;
    restoreWrappedMethods();
  }

  async function applyState(state: AutarkProvenanceState): Promise<void> {
    const data = state.data;
    if (!data?.workspace) return;
    const current = getWorkspaceSafe();
    if (current !== data.workspace) {
      isApplyingState = true;
      try {
        await db.setWorkspace(data.workspace);
      } finally {
        isApplyingState = false;
      }
    }
  }

  return {
    startRecording,
    stopRecording,
    bootstrapFromCurrentState,
    recordInit,
    recordWorkspace,
    recordLoadOsm,
    recordLoadCsv,
    recordLoadJson,
    recordLoadLayer,
    recordLoadCustomLayer,
    recordLoadGridLayer,
    recordGetLayer,
    recordSpatialJoin,
    recordUpdateTable,
    recordDropTable,
    recordRawQuery,
    recordBuildHeatmap,
    applyState,
  };
}

/**
 * Starts automatic provenance tracking for a SpatialDb-like instance.
 * The same db instance is returned for convenience.
 */
export function createDbProvenanceWrapper<T extends IDbForProvenance>(
  db: T,
  onRecord: DbRecordCallback
): T {
  const adapter = createDbAdapter(db, onRecord);
  adapter.startRecording();
  return db;
}
