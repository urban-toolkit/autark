/**
 * Use case for updating existing DuckDB tables with new data.
 *
 * Supports two strategies: `'replace'` for full table recreation and `'update'` for ID-based row modification. Handles both layer tables (GeoJSON) and plain data tables.
 *
 * @module update-table
 */
export { UpdateTableUseCase } from './update-table-use-case';
export type { UpdateTableParams, UpdateTableResult, UpdateStrategy } from './interfaces';
export { parseIdColumn } from './interfaces';
