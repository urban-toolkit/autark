import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { GetTableDataParams, GetTableDataOutput } from './interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { toPlain } from '../../utils';

/**
 * Reads rows from any DuckDB table as plain JavaScript objects.
 *
 * Supports pagination via `LIMIT`/`OFFSET` and returns rows with column names as keys.
 *
 * @note Requires an active `AsyncDuckDBConnection`.
 */
export class GetTableDataUseCase {
  /** DuckDB connection used to execute queries. */
  private conn: AsyncDuckDBConnection;

  /**
   * Creates a new instance bound to the given DuckDB connection.
   *
   * @param conn - Open connection used to execute SQL queries.
   */
  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  /**
   * Fetches rows from a table with optional pagination.
   *
   * @param params - configuration including table name, optional `limit`, `offset`, and `workspace`.
   * @returns array of plain objects where each object represents one row.
   * @throws {Error} If the table does not exist or the query fails.
   * @example
   * const useCase = new GetTableDataUseCase(conn);
   * const rows = await useCase.exec({ tableName: 'places', limit: 10 });
   * console.log(rows.length); // up to 10
   * @example
   * const rows = await useCase.exec({ tableName: 'places', limit: 5, offset: 10 });
   * // Skips first 10 rows, returns next 5.
   */
  async exec(params: GetTableDataParams): Promise<GetTableDataOutput> {
    const workspace = params.workspace || DEFAULT_WORKSPACE_NAME;
    const qualifiedTableName = `${workspace}.${params.tableName}`;
    let query = `SELECT * FROM ${qualifiedTableName}`;

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

