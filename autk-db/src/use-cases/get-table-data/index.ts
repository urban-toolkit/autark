/**
 * Use case for reading rows from any DuckDB table as plain JavaScript objects.
 *
 * Supports pagination via `limit` and `offset`, and works across workspaces.
 *
 * @module get-table-data
 */
export { GetTableDataUseCase } from './get-table-data-use-case';
export type { GetTableDataParams, GetTableDataOutput } from './interfaces';

