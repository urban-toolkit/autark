import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { GetTableDataParams, GetTableDataOutput } from './interfaces';
import { toPlain } from '../../shared/utils';

export class GetTableDataUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: GetTableDataParams): Promise<GetTableDataOutput> {
    let query = `SELECT * FROM ${params.tableName}`;

    if (params.limit !== undefined) {
      query += ` LIMIT ${params.limit}`;
    }

    if (params.offset !== undefined) {
      query += ` OFFSET ${params.offset}`;
    }

    const result = await this.conn.query(query);
    return result.toArray().map((row) => toPlain(row.toJSON())) as GetTableDataOutput;
  }
}

