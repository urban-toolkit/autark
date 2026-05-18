/**
 * Parameters for querying rows from a DuckDB table.
 *
 * @example
 * const params: GetTableDataParams = { tableName: 'places', limit: 100 };
 * const paramsPaginated: GetTableDataParams = { tableName: 'places', limit: 50, offset: 100 };
 */
export interface GetTableDataParams {
  /** Unqualified name of the table to read rows from. */
  tableName: string;
  /** Maximum number of rows to return. */
  limit?: number;
  /** Number of rows to skip before returning results. */
  offset?: number;
  /** Workspace namespace used to qualify the table name. Defaults to the system workspace. */
  workspace?: string;
}

/**
 * Array of plain objects representing rows from the queried table.
 *
 * Each object's keys correspond to the table column names.
 *
 * @example
 * const rows: GetTableDataOutput = [{ name: 'Park A', area: 500 }, { name: 'Park B', area: 1200 }];
 */
export type GetTableDataOutput = Record<string, unknown>[];

