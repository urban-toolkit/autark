import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { DropTableParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../../../shared/consts';
import { DROP_TABLE_QUERY } from './queries';

export interface DropTableResult {
  success: boolean;
  message: string;
}

/**
 * Drops a table from the current workspace.
 */
export class DropTableUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  /**
   * Drops the specified table, returning success/failure rather than throwing.
   *
   * @param params.tableName Name of the table to drop.
   * @param params.workspace Optional workspace name (defaults to `autk`).
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
