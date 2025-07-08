import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { CsvTable } from '../../../shared/interfaces';
import { LOAD_CSV_ON_TABLE_QUERY, LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';

export class LoadCsvUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ csvFileUrl, outputTableName, geometryColumns, delimiter = ',' }: Params): Promise<CsvTable> {
    let loadCsvQuery: string;
    if (geometryColumns) {
      loadCsvQuery = LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY({
        csvFileUrl,
        tableName: outputTableName,
        delimiter,
        latColumnName: geometryColumns.latColumnName,
        longColumnName: geometryColumns.longColumnName,
        coordinateFormat: geometryColumns.coordinateFormat || DEFALT_COORDINATE_FORMAT,
      });
    } else {
      loadCsvQuery = LOAD_CSV_ON_TABLE_QUERY(csvFileUrl, outputTableName, delimiter);
    }

    const describeTableResponse = await this.conn.query(loadCsvQuery);

    return {
      source: 'csv',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
    };
  }
}
