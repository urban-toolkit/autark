import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface DropTableParams {
  tableName: string;
  workspace?: string;
}

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
   * @param params.workspace Optional workspace name (defaults to `main`).
   * @returns Result indicating success or failure with a message.
   * @throws Never throws. Errors are caught and returned in the result.
   */
  async exec(params: DropTableParams): Promise<DropTableResult> {
    try {
      const workspace = params.workspace || 'main';
      const qualifiedTableName = `${workspace}.${params.tableName}`;
      await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedTableName};`);
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
