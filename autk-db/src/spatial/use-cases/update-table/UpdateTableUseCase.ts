import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { Table } from '../../../shared/interfaces';
import { UpdateTableParams, UpdateTableResult, parseIdColumn } from './interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
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

export class UpdateTableUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec(params: UpdateTableParams, existingTable: Table): Promise<UpdateTableResult> {
    const { strategy, workspace = 'main' } = params;

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
   * Determines if a table is a layer table (has geometry) based on its source.
   */
  private isLayerTable(table: Table): boolean {
    return table.source === 'osm' || table.source === 'geojson';
  }

  /**
   * Validates that the input data format matches the table type.
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
   * Type guard to check if data is a FeatureCollection.
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
   * Creates a temporary file with the data and returns the file name.
   */
  private async createTempFile(data: FeatureCollection | Record<string, unknown>[]): Promise<string> {
    const fileName = `temp_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
    await this.db.registerFileText(fileName, JSON.stringify(data));
    return fileName;
  }

  /**
   * Cleans up the temporary file.
   */
  private async cleanupTempFile(fileName: string): Promise<void> {
    try {
      await this.db.dropFile(fileName);
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Executes the replace strategy: drop and recreate the table with new data.
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
   * Executes the update strategy: update existing records by ID.
   * Does NOT insert new records - only modifies records that already exist.
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
