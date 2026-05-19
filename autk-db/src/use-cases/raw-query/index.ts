/**
 * Raw SQL execution helpers for DuckDB.
 *
 * Exposes a use case for executing arbitrary SQL queries against the active connection,
 * plus the parameter and error types used by the raw query API.
 *
 * @module raw-query
 */
export * from './use-case';
export * from './interfaces';
export * from './errors';
