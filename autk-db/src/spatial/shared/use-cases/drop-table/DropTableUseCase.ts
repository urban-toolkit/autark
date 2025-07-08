import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface DropTableParams {
  tableName: string;
}

export interface DropTableResult {
  success: boolean;
  message: string;
}

export class DropTableUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: DropTableParams): Promise<DropTableResult> {
    try {
      await this.conn.query(`DROP TABLE IF EXISTS ${params.tableName};`);
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
