/**
 * Use case for reading rows from any DuckDB table as plain JavaScript objects.
 *
 * Supports pagination via `limit` and `offset`, and works across workspaces.
 *
 * @module get-tables
 */
export { GetTablesUseCase } from './use-case';
export type { GetTablesParams, GetTablesOutput } from './interfaces';

