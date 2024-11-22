import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { CsvTable } from '../../shared/interfaces';
import { LOAD_CSV_ON_TABLE_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescription } from '../../shared/utils';

export class LoadCsvUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ csvFileUrl, tableName, delimiter = ',' }: Params): Promise<CsvTable> {
    const loadCsvQuery = LOAD_CSV_ON_TABLE_QUERY(csvFileUrl, tableName, delimiter);
    const response = await this.conn.query(loadCsvQuery);

    return {
      type: 'csv',
      name: tableName,
      columns: getColumnsFromDuckDbTableDescription(response.toArray()),
    };
  }
}
