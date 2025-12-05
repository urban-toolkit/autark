import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface DropTableParams {
  tableName: string;
  workspace?: string;
}

export interface DropTableResult {
  success: boolean;
  message: string;
}

export class DropTableUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

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
