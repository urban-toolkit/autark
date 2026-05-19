import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { DropTableParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { DROP_TABLE_QUERY } from './queries';

/**
 * Result of a table drop operation.
 *
 * @param success - Whether the table was dropped successfully.
 * @param message - Human-readable status or error description.
 */
export interface DropTableResult {
  success: boolean;
  message: string;
}

/**
 * Drops a table from the current workspace, returning success/failure rather than throwing.
 */
export class DropTableUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  /**
   * Drops the specified table, returning success/failure rather than throwing.
   *
   * @param params - Drop configuration including table name and optional workspace.
   * @returns Result indicating success or failure with a message.
   * @throws Never throws. Errors are caught and returned in the result.
   */
  async exec(params: DropTableParams): Promise<DropTableResult> {
    try {
      const workspace = params.workspace || DEFAULT_WORKSPACE_NAME;
      await this.conn.query(DROP_TABLE_QUERY(params.tableName, workspace));
      return {
        success: true,
        message: `Table ${params.tableName} dropped successfully`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error dropping table ${params.tableName}: ${error}`,
      };
    }
  }
}
