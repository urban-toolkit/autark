import { FeatureCollection } from 'geojson';
import { Table, Column } from '../../interfaces';

/**
 * Strategy for replacing or updating an existing table.
 *
 * - `'replace'` drops and recreates the entire table with new data.
 * - `'update'` modifies existing records by ID without inserting new ones.
 *
 * @example
 * const strategy: UpdateStrategy = 'update';
 */
export type UpdateStrategy = 'replace' | 'update';

/**
 * Parameters for updating an existing DuckDB table with new data.
 *
 * When using the `'update'` strategy, `idColumn` is required and can reference a direct column (e.g. `'id'`) or a nested property (e.g. `'properties.building_id'`).
 *
 * @example
 * const params: UpdateTableParams = { tableName: 'places', data: geoJson, strategy: 'replace' };
 * @example
 * const params: UpdateTableParams = { tableName: 'buildings', data: geoJson, strategy: 'update', idColumn: 'properties.building_id' };
 */
export interface UpdateTableParams {
  /** Name of the table to update. */
  tableName: string;
  /** GeoJSON FeatureCollection for layer tables, or a plain object array for CSV/JSON tables. */
  data: FeatureCollection | Record<string, unknown>[];
  /**
   * Strategy for updating the table:
   * - `'replace'`: Drop and recreate the entire table with the new data.
   * - `'update'`: Update existing records by ID (does not insert new records).
   */
  strategy: UpdateStrategy;
  /**
   * Required when `strategy` is `'update'`.
   *
   * Supports direct column names (`'id'`) or nested property paths (`'properties.building_id'`) that resolve to `properties->>'building_id'` in SQL.
   */
  idColumn?: string;
  /** Workspace namespace used to qualify the table name. Defaults to the system workspace. */
  workspace?: string;
}

/**
 * Result of an update operation containing the updated table metadata and its columns.
 *
 * @example
 * const result: UpdateTableResult = { table: updatedTable, updatedColumns: columns };
 */
export interface UpdateTableResult {
  /** The updated table metadata with refreshed column information. */
  table: Table;
  /** List of columns after the update operation. */
  updatedColumns: Column[];
}

/**
 * Parses an `idColumn` specification into a SQL-ready expression.
 *
 * Converts `'properties.building_id'` into `properties->>'building_id'` for DuckDB JSON access, or passes through plain column names unchanged.
 *
 * @param idColumn - column reference such as `'id'` or `'properties.building_id'`.
 * @returns object containing the resolved SQL expression and whether the reference targets a nested property.
 * @throws No runtime errors — returns a pure parsing result.
 * @example
 * parseIdColumn('id');
 * // { isPropertiesPath: false, columnName: 'id', sqlExpression: 'id' }
 * @example
 * parseIdColumn('properties.building_id');
 * // { isPropertiesPath: true, columnName: 'building_id', sqlExpression: "properties->>'building_id'" }
 */
export function parseIdColumn(idColumn: string): {
  isPropertiesPath: boolean;
  columnName: string;
  sqlExpression: string;
} {
  if (idColumn.startsWith('properties.')) {
    const propertyKey = idColumn.slice('properties.'.length);
    return {
      isPropertiesPath: true,
      columnName: propertyKey,
      sqlExpression: `properties->>'${propertyKey}'`,
    };
  }
  
  return {
    isPropertiesPath: false,
    columnName: idColumn,
    sqlExpression: idColumn,
  };
}
