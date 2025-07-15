import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { CsvTable } from '../../../shared/interfaces';
import { LOAD_CSV_ON_TABLE_QUERY, LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';

export class LoadCsvUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({ csvFileUrl, csvObject, outputTableName, geometryColumns, delimiter = ',' }: Params): Promise<CsvTable> {
    if (!csvFileUrl && !csvObject) {
      throw new Error('Either csvFileUrl or csvObject must be provided');
    }
    if (csvFileUrl && csvObject) {
      throw new Error('Cannot provide both csvFileUrl and csvObject. Please provide only one.');
    }

    let csvPath = csvFileUrl as string;
    let tempFileCreated = false;

    if (csvObject) {
      const csvString = this.buildCsvString(csvObject, delimiter);

      csvPath = `temp_csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.csv`;
      await this.db.registerFileText(csvPath, csvString);
      tempFileCreated = true;
    }

    let loadCsvQuery: string;
    if (geometryColumns) {
      loadCsvQuery = LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY({
        csvFileUrl: csvPath,
        tableName: outputTableName,
        delimiter,
        latColumnName: geometryColumns.latColumnName,
        longColumnName: geometryColumns.longColumnName,
        coordinateFormat: geometryColumns.coordinateFormat || DEFALT_COORDINATE_FORMAT,
      });
    } else {
      loadCsvQuery = LOAD_CSV_ON_TABLE_QUERY(csvPath, outputTableName, delimiter);
    }

    const describeTableResponse = await this.conn.query(loadCsvQuery);

    if (tempFileCreated) {
      await this.db.dropFile(csvPath);
    }

    return {
      source: 'csv',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
    };
  }

  private buildCsvString(csvObject: unknown[][], delimiter: string): string {
    return csvObject
      .map((row) =>
        row
          .map((value) => {
            const str = String(value ?? '');
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(delimiter),
      )
      .join('\n');
  }
}
