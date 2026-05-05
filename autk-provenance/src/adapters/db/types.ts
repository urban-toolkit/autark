import type { AutarkProvenanceState } from '../../types';
import { ProvenanceAction } from '../../types';

export type DbTableLike = {
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

export type DbRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;
