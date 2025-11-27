export interface GetTableDataParams {
  tableName: string;
  limit?: number;
  offset?: number;
}

export type GetTableDataOutput = Record<string, unknown>[];

