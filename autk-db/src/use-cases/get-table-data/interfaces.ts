export interface GetTableDataParams {
  tableName: string;
  limit?: number;
  offset?: number;
  workspace?: string;
}

export type GetTableDataOutput = Record<string, unknown>[];

