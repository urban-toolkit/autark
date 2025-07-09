import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Params } from './interfaces';
import { Table } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { LOAD_QUERY_QUERY } from './queries';

export class LoadQueryUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ query, outputTableName, mainTable }: Params): Promise<Table> {
    const loadQueryQuery = LOAD_QUERY_QUERY(query, outputTableName);
    const tableDescribeResponse = await this.conn.query(loadQueryQuery);

    return {
      source: mainTable.source,
      type: mainTable.type,
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
    } as Table;
  }
}
