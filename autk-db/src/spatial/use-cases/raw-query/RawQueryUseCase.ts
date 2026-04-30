import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { RawQueryParams, RawQueryOutput } from './interfaces';
import { NonSelectQueryError } from './errors';
import { Table } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe, toPlain } from '../../shared/utils';

/**
 * Executes a raw SQL query with safety validation against mutation statements.
 */
export class RawQueryUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: RawQueryParams): Promise<Table | RawQueryOutput> {
    this.validateQuery(params.query);

    if (params.output.type === 'CREATE_TABLE') {
      if (!params.output.tableName) {
        throw new Error('output.tableName must be provided when output.type is "CREATE_TABLE"');
      }

      const tableName = params.output.tableName;

      const createTableQuery = `CREATE OR REPLACE TABLE ${tableName} AS\n${params.query};\n\nDESCRIBE ${tableName};`;

      const describeResult = await this.conn.query(createTableQuery);

      const table = {
        source: params.output.source || 'user',
        type: params.output.tableType || 'pointset',
        name: tableName,
        columns: getColumnsFromDuckDbTableDescribe(describeResult.toArray()),
      } as unknown as Table;

      return table;
    }

    const res = await this.conn.query(params.query);
    return res.toArray().map((row) => toPlain(row.toJSON())) as RawQueryOutput;
  }

  private validateQuery(query: string) {
    const q = query.trim().toLowerCase();

    // Allow queries that start with SELECT or WITH (CTE followed by SELECT)
    const isSelectLike = q.startsWith('select') || q.startsWith('with');

    const forbidden = ['insert', 'update', 'delete', 'create', 'alter', 'drop', 'truncate', 'replace'];
    const hasForbidden = forbidden.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(q));

    if (!isSelectLike || hasForbidden) {
      throw new NonSelectQueryError();
    }
  }
}
