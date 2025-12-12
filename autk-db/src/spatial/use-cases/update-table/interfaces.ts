import { FeatureCollection } from 'geojson';
import { Table, Column } from '../../../shared/interfaces';

export type UpdateStrategy = 'replace' | 'update';

export interface UpdateTableParams {
  tableName: string;
  data: FeatureCollection | Record<string, unknown>[];
  /**
   * Strategy for updating the table:
   * - 'replace': Drop and recreate the entire table with the new data
   * - 'update': Update existing records by ID (does NOT insert new records)
   */
  strategy: UpdateStrategy;
  /**
   * Required when strategy is 'update'.
   * Supports:
   * - Direct column: 'id' → matches on the id column directly
   * - Nested in properties: 'properties.building_id' → matches on properties->>'building_id'
   */
  idColumn?: string;
  workspace?: string;
}

export interface UpdateTableResult {
  table: Table;
  updatedColumns: Column[];
}

/**
 * Parses the idColumn parameter to determine if it's a direct column or nested in properties.
 * @param idColumn - The id column specification (e.g., 'id' or 'properties.building_id')
 * @returns An object with the column expression for SQL and whether it's in properties
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
