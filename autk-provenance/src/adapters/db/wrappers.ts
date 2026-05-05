import type { DbRecorder } from './recorder';
import type { IDbForProvenance } from './types';
import { inferName, isFunction } from './utils';

export function createDbMethodRecordingController(options: {
  db: IDbForProvenance;
  recorder: DbRecorder;
  isRecording: () => boolean;
  isApplyingState: () => boolean;
}): { start(): void; stop(): void } {
  const { db, recorder, isRecording, isApplyingState } = options;
  const dbObj = db as unknown as Record<string, unknown>;
  const originalMethods = new Map<string, unknown>();

  function wrapAsyncMethod(methodName: string, onAfter: (args: unknown[], result: unknown) => void): void {
    const current = dbObj[methodName];
    if (!isFunction(current) || originalMethods.has(methodName)) return;
    originalMethods.set(methodName, current);
    dbObj[methodName] = async function (...args: unknown[]) {
      const result = await current.apply(this, args);
      if (isRecording() && !isApplyingState()) onAfter(args, result);
      return result;
    };
  }

  return {
    start: () => {
      wrapAsyncMethod('init', () => recorder.recordInit());
      wrapAsyncMethod('setWorkspace', ([name]) => recorder.recordWorkspace(typeof name === 'string' ? name : db.getCurrentWorkspace()));
      wrapAsyncMethod('loadOsmFromOverpassApi', ([params]) => recorder.recordLoadOsm(((params ?? {}) as { outputTableName?: string }).outputTableName ?? 'osm'));
      wrapAsyncMethod('loadCsv', ([params], result) => recorder.recordLoadCsv(((params ?? {}) as { outputTableName?: string }).outputTableName ?? inferName(result, 'csv')));
      wrapAsyncMethod('loadJson', ([params], result) => recorder.recordLoadJson(((params ?? {}) as { outputTableName?: string }).outputTableName ?? inferName(result, 'json')));
      wrapAsyncMethod('loadLayer', ([params], result) => {
        const resolved = (params ?? {}) as { layer?: string; outputTableName?: string };
        recorder.recordLoadLayer(resolved.outputTableName ?? resolved.layer ?? inferName(result, 'layer'));
      });
      wrapAsyncMethod('loadCustomLayer', ([params], result) => recorder.recordLoadCustomLayer(((params ?? {}) as { outputTableName?: string }).outputTableName ?? inferName(result, 'custom-layer')));
      wrapAsyncMethod('loadGridLayer', ([params], result) => recorder.recordLoadGridLayer(((params ?? {}) as { outputTableName?: string }).outputTableName ?? inferName(result, 'grid-layer')));
      wrapAsyncMethod('getLayer', ([tableName]) => recorder.recordGetLayer(typeof tableName === 'string' ? tableName : 'layer'));
      wrapAsyncMethod('spatialJoin', ([params]) => recorder.recordSpatialJoin((params ?? {}) as { tableRootName?: string; tableJoinName?: string }));
      wrapAsyncMethod('updateTable', ([params], result) => recorder.recordUpdateTable(((params ?? {}) as { tableName?: string }).tableName ?? inferName(result, 'table')));
      wrapAsyncMethod('rawQuery', ([params]) => recorder.recordRawQuery(((params ?? {}) as { output?: { type?: string } }).output?.type === 'CREATE_TABLE' ? 'Raw query created table' : 'Raw query executed'));
      wrapAsyncMethod('buildHeatmap', ([params], result) => recorder.recordBuildHeatmap(((params ?? {}) as { outputTableName?: string }).outputTableName ?? inferName(result, 'heatmap')));
    },
    stop: () => {
      originalMethods.forEach((original, methodName) => {
        dbObj[methodName] = original;
      });
      originalMethods.clear();
    },
  };
}
