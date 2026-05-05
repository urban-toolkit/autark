import type { AutarkProvenanceState } from '../types';
import { ProvenanceAction } from '../types';

export type DbRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

export type DbTableLike = {
  name: string;
  source?: string;
  type?: string;
};

export interface DbStateSource {
  getCurrentWorkspace(): string;
  tables: DbTableLike[];
}

export interface DbRecorderSet {
  getCurrentLayerNames(): string[];
  getWorkspaceSafe(): string;
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
}
