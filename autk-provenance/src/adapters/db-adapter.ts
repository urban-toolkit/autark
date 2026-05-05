import type { AutarkProvenanceState } from '../types';
import { createDbRecorder } from './db/recorder';
import { applyDbState } from './db/state';
import type { DbRecordCallback, IDbForProvenance } from './db/types';
import { createDbMethodRecordingController } from './db/wrappers';

export type { DbRecordCallback, IDbForProvenance } from './db/types';

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

export function createDbAdapter(db: IDbForProvenance, onRecord: DbRecordCallback): DbAdapterApi {
  let isRecording = false;
  let isApplyingState = false;
  const recorder = createDbRecorder(db, onRecord);
  const methodRecording = createDbMethodRecordingController({
    db,
    recorder,
    isRecording: () => isRecording,
    isApplyingState: () => isApplyingState,
  });

  return {
    startRecording: () => {
      if (isRecording) return;
      isRecording = true;
      recorder.bootstrapFromCurrentState();
      methodRecording.start();
    },
    stopRecording: () => {
      if (!isRecording) return;
      isRecording = false;
      methodRecording.stop();
    },
    ...recorder,
    applyState: (state) => applyDbState(db, state, (value) => { isApplyingState = value; }),
  };
}

export function createDbProvenanceWrapper<T extends IDbForProvenance>(
  db: T,
  onRecord: DbRecordCallback
): T {
  createDbAdapter(db, onRecord).startRecording();
  return db;
}
