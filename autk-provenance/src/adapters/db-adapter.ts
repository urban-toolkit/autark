import type { AutarkProvenanceState } from '../types';
import {
  createDbRecorderSet,
  inferName,
  isFn,
  type DbRecordCallback,
  type DbTableLike,
} from './db-adapter-shared';
export { createDbProvenanceWrapper } from './db-provenance-wrapper';

export type { DbRecordCallback };

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

export function createDbAdapter(
  db: IDbForProvenance,
  onRecord: DbRecordCallback
): DbAdapterApi {
  const dbObj = db as unknown as Record<string, unknown>;
  const recorder = createDbRecorderSet(db, onRecord);
  const originalMethods = new Map<string, unknown>();
  let isRecording = false;
  let isApplyingState = false;

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

    recorder.bootstrapFromCurrentState();

    wrapAsyncMethod('init', () => {
      recorder.recordInit();
    });
    wrapAsyncMethod('setWorkspace', (args) => {
      const [name] = args;
      recorder.recordWorkspace(typeof name === 'string' ? name : recorder.getWorkspaceSafe());
    });
    wrapAsyncMethod('loadOsmFromOverpassApi', (args) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordLoadOsm(params.outputTableName ?? 'osm');
    });
    wrapAsyncMethod('loadCsv', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordLoadCsv(params.outputTableName ?? inferName(result, 'csv'));
    });
    wrapAsyncMethod('loadJson', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordLoadJson(params.outputTableName ?? inferName(result, 'json'));
    });
    wrapAsyncMethod('loadLayer', (args, result) => {
      const params = (args[0] ?? {}) as { layer?: string; outputTableName?: string };
      recorder.recordLoadLayer(params.outputTableName ?? params.layer ?? inferName(result, 'layer'));
    });
    wrapAsyncMethod('loadCustomLayer', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordLoadCustomLayer(params.outputTableName ?? inferName(result, 'custom-layer'));
    });
    wrapAsyncMethod('loadGridLayer', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordLoadGridLayer(params.outputTableName ?? inferName(result, 'grid-layer'));
    });
    wrapAsyncMethod('getLayer', (args) => {
      const [tableName] = args;
      recorder.recordGetLayer(typeof tableName === 'string' ? tableName : 'layer');
    });
    wrapAsyncMethod('spatialJoin', (args) => {
      const params = (args[0] ?? {}) as { tableRootName?: string; tableJoinName?: string };
      recorder.recordSpatialJoin(params);
    });
    wrapAsyncMethod('updateTable', (args, result) => {
      const params = (args[0] ?? {}) as { tableName?: string };
      recorder.recordUpdateTable(params.tableName ?? inferName(result, 'table'));
    });
    wrapAsyncMethod('rawQuery', (args) => {
      const params = (args[0] ?? {}) as { output?: { type?: string } };
      const label = params.output?.type === 'CREATE_TABLE'
        ? 'Raw query created table'
        : 'Raw query executed';
      recorder.recordRawQuery(label);
    });
    wrapAsyncMethod('buildHeatmap', (args, result) => {
      const params = (args[0] ?? {}) as { outputTableName?: string };
      recorder.recordBuildHeatmap(params.outputTableName ?? inferName(result, 'heatmap'));
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
    const current = recorder.getWorkspaceSafe();
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
    bootstrapFromCurrentState: recorder.bootstrapFromCurrentState,
    recordInit: recorder.recordInit,
    recordWorkspace: recorder.recordWorkspace,
    recordLoadOsm: recorder.recordLoadOsm,
    recordLoadCsv: recorder.recordLoadCsv,
    recordLoadJson: recorder.recordLoadJson,
    recordLoadLayer: recorder.recordLoadLayer,
    recordLoadCustomLayer: recorder.recordLoadCustomLayer,
    recordLoadGridLayer: recorder.recordLoadGridLayer,
    recordGetLayer: recorder.recordGetLayer,
    recordSpatialJoin: recorder.recordSpatialJoin,
    recordUpdateTable: recorder.recordUpdateTable,
    recordDropTable: recorder.recordDropTable,
    recordRawQuery: recorder.recordRawQuery,
    recordBuildHeatmap: recorder.recordBuildHeatmap,
    applyState,
  };
}
