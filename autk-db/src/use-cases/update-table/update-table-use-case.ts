import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { isVectorTable, Table } from '../../interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { UpdateTableParams, UpdateTableResult, parseIdColumn } from './interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import {
  REPLACE_LAYER_TABLE_QUERY,
  REPLACE_DATA_TABLE_QUERY,
  CREATE_LAYER_STAGING_TABLE_QUERY,
  CREATE_DATA_STAGING_TABLE_QUERY,
  DELETE_MATCHING_IDS_QUERY,
  INSERT_FROM_STAGING_QUERY,
  UPDATE_LAYER_FROM_STAGING_QUERY,
  DROP_STAGING_TABLE_QUERY,
  DESCRIBE_TABLE_QUERY,
} from './queries';

/**
 * Updates an existing DuckDB table with new data using replace or update-by-ID strategies.
 *
 * Supports both layer tables (GeoJSON with geometry) and plain data tables (CSV/JSON-derived).
 *
 * @note Requires an active `AsyncDuckDB` instance and connection.
 */
export class UpdateTableUseCase {
  /** DuckDB instance used for temporary file registration and cleanup. */
  private db: AsyncDuckDB;
  /** Open connection used to execute SQL queries. */
  private conn: AsyncDuckDBConnection;

  /**
   * Creates a new instance bound to the given DuckDB connection.
   *
   * @param db - DuckDB instance used for temporary file management.
   * @param conn - Open connection used to execute SQL queries.
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Updates a table using the specified strategy: replace (full recreation) or update (ID-based modification).
   *
   * @param params - configuration including table name, new data, strategy, and optional `idColumn`.
   * @param existingTable - current table metadata used to determine if this is a layer table.
   * @returns the updated table metadata and its refreshed column list.
   * @throws {Error} If `idColumn` is missing for the `'update'` strategy, if the data format mismatches the table type, or if any SQL execution fails.
   * @example
   * const useCase = new UpdateTableUseCase(db, conn);
   * const result = await useCase.exec({ tableName: 'places', data: newData, strategy: 'replace' }, existingTable);
   * console.log(result.updatedColumns.length);
   */
  async exec(params: UpdateTableParams, existingTable: Table): Promise<UpdateTableResult> {
    const { strategy, workspace = DEFAULT_WORKSPACE_NAME } = params;

    if (strategy === 'update' && !params.idColumn) {
      throw new Error('idColumn is required when using the update strategy');
    }

    const isLayerTable = this.isLayerTable(existingTable);

    if (strategy === 'replace') {
      return this.executeReplaceStrategy(params, existingTable, isLayerTable, workspace);
    } else {
      return this.executeUpdateStrategy(params, existingTable, isLayerTable, workspace);
    }
  }

  /**
   * Checks whether the table is a vector/layer table that stores geometry.
   *
   * @param table - table metadata to inspect.
   * @returns `true` if the table has geometry columns.
   * @throws No runtime errors — returns a boolean.
   */
  private isLayerTable(table: Table): boolean {
    return isVectorTable(table);
  }

  /**
   * Validates that the input data type matches the table structure (GeoJSON for layers, objects for plain tables).
   *
   * @param data - the input data to validate.
   * @param isLayerTable - whether the target table stores geometry.
   * @throws {Error} If a layer table receives non-GeoJSON data, or a non-layer table receives a FeatureCollection.
   */
  private validateDataFormat(data: FeatureCollection | Record<string, unknown>[], isLayerTable: boolean): void {
    if (isLayerTable) {
      if (!this.isFeatureCollection(data)) {
        throw new Error('Layer tables require a GeoJSON FeatureCollection as input data');
      }
    } else {
      if (this.isFeatureCollection(data)) {
        throw new Error('Non-layer tables (CSV/JSON) require an array of objects as input data');
      }
    }
  }

  /**
   * Type guard that checks whether a value is a GeoJSON FeatureCollection.
   *
   * @param data - value to test.
   * @returns `true` if the value has `type: 'FeatureCollection'` and a `features` array.
   * @throws No runtime errors — returns a boolean.
   */
  private isFeatureCollection(data: unknown): data is FeatureCollection {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      (data as FeatureCollection).type === 'FeatureCollection' &&
      'features' in data &&
      Array.isArray((data as FeatureCollection).features)
    );
  }

  /**
   * Registers the input data as a temporary JSON file in DuckDB's in-memory filesystem.
   *
   * @param data - GeoJSON FeatureCollection or plain object array to serialize.
   * @returns the virtual file path registered in DuckDB.
   * @throws {Error} If DuckDB file registration fails.
   */
  private async createTempFile(data: FeatureCollection | Record<string, unknown>[]): Promise<string> {
    const fileName = `temp_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
    await this.db.registerFileText(fileName, JSON.stringify(data));
    return fileName;
  }

  /**
   * Removes a temporary file from DuckDB's in-memory filesystem, ignoring any cleanup errors.
   *
   * @param fileName - virtual file path to remove.
   * @throws No errors are propagated — failures are silently ignored.
   */
  private async cleanupTempFile(fileName: string): Promise<void> {
    try {
      await this.db.dropFile(fileName);
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Replaces the entire table by dropping and recreating it with the new data.
   *
   * For layer tables the geometry is extracted and transformed; for plain tables the data is loaded directly.
   *
   * @param params - configuration with table name and new data.
   * @param existingTable - current table metadata used to produce the updated result.
   * @param isLayerTable - whether the target table stores geometry.
   * @param workspace - workspace namespace qualifying the table name.
   * @returns the updated table metadata and its refreshed column list.
   * @throws {Error} If the data format is invalid or the table creation query fails.
   */
  private async executeReplaceStrategy(
    params: UpdateTableParams,
    existingTable: Table,
    isLayerTable: boolean,
    workspace: string,
  ): Promise<UpdateTableResult> {
    const { tableName, data } = params;

    this.validateDataFormat(data, isLayerTable);

    const tempFileName = await this.createTempFile(data);

    try {
      let query: string;
      if (isLayerTable) {
        query = REPLACE_LAYER_TABLE_QUERY(tempFileName, tableName, workspace);
      } else {
        query = REPLACE_DATA_TABLE_QUERY(tempFileName, tableName, workspace);
      }

      const describeResult = await this.conn.query(query);
      const updatedColumns = getColumnsFromDuckDbTableDescribe(describeResult.toArray());

      const updatedTable: Table = {
        ...existingTable,
        columns: updatedColumns,
      };

      return {
        table: updatedTable,
        updatedColumns,
      };
    } finally {
      await this.cleanupTempFile(tempFileName);
    }
  }

  /**
   * Updates existing records by ID using a staging table approach.
   *
   * For layer tables only matching rows are updated (no inserts). For non-layer tables matching rows are deleted and all staging rows are inserted.
   *
   * @param params - configuration with table name, new data, and the `idColumn` for matching.
   * @param existingTable - current table metadata used to produce the updated result.
   * @param isLayerTable - whether the target table stores geometry.
   * @param workspace - workspace namespace qualifying the table name.
   * @returns the updated table metadata and its refreshed column list.
   * @throws {Error} If the data format is invalid, if any staging/merge SQL query fails, or if cleanup fails unexpectedly.
   */
  private async executeUpdateStrategy(
    params: UpdateTableParams,
    existingTable: Table,
    isLayerTable: boolean,
    workspace: string,
  ): Promise<UpdateTableResult> {
    const { tableName, data, idColumn } = params;

    this.validateDataFormat(data, isLayerTable);

    const { sqlExpression } = parseIdColumn(idColumn!);
    const stagingTableName = `_staging_${tableName}_${Date.now()}`;
    const tempFileName = await this.createTempFile(data);

    try {
      // 1. Create staging table with transformed data
      let createStagingQuery: string;
      if (isLayerTable) {
        createStagingQuery = CREATE_LAYER_STAGING_TABLE_QUERY(tempFileName, stagingTableName);
      } else {
        createStagingQuery = CREATE_DATA_STAGING_TABLE_QUERY(tempFileName, stagingTableName);
      }
      await this.conn.query(createStagingQuery);

      if (isLayerTable) {
        // For layer tables: UPDATE existing records only
        // We can't INSERT new records because OSM layers require columns (id, refs)
        // that we don't have in the GeoJSON data
        const updateQuery = UPDATE_LAYER_FROM_STAGING_QUERY(tableName, stagingTableName, sqlExpression, workspace);
        await this.conn.query(updateQuery);
      } else {
        // For non-layer tables: DELETE + INSERT (full row replacement)
        
        // 2. Delete matching records from target table
        const deleteQuery = DELETE_MATCHING_IDS_QUERY(tableName, stagingTableName, sqlExpression, workspace);
        await this.conn.query(deleteQuery);

        // 3. Insert all records from staging table
        const insertQuery = INSERT_FROM_STAGING_QUERY(tableName, stagingTableName, workspace);
        await this.conn.query(insertQuery);
      }

      // 4. Clean up staging table
      const dropStagingQuery = DROP_STAGING_TABLE_QUERY(stagingTableName);
      await this.conn.query(dropStagingQuery);

      // 5. Get updated column information
      const describeQuery = DESCRIBE_TABLE_QUERY(tableName, workspace);
      const describeResult = await this.conn.query(describeQuery);
      const updatedColumns = getColumnsFromDuckDbTableDescribe(describeResult.toArray());

      const updatedTable: Table = {
        ...existingTable,
        columns: updatedColumns,
      };

      return {
        table: updatedTable,
        updatedColumns,
      };
    } finally {
      await this.cleanupTempFile(tempFileName);
      // Ensure staging table is dropped even on error
      try {
        await this.conn.query(DROP_STAGING_TABLE_QUERY(stagingTableName));
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
}
