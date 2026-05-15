import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { LoadCsvParams } from './interfaces';
import { CsvTable } from '../../interfaces';
import { LOAD_CSV_ON_TABLE_QUERY, LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT, DEFAULT_GEO_COLUMN_NAME } from '../../consts';

/**
 * Loads CSV data into DuckDB, with optional geometry column creation.
 */
export class LoadCsvUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({ csvFileUrl, csvObject, outputTableName, geometryColumns, delimiter = ',', workspace = DEFAULT_WORKSPACE_NAME, workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT }: LoadCsvParams & { workspaceCoordinateFormat?: string }): Promise<CsvTable> {
    if (!csvFileUrl && !csvObject) {
      throw new Error('Either csvFileUrl or csvObject must be provided');
    }
    if (csvFileUrl && csvObject) {
      throw new Error('Cannot provide both csvFileUrl and csvObject. Please provide only one.');
    }

    const csvString = csvFileUrl
      ? await fetch(csvFileUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP error! Error to load ${csvFileUrl}! Status: ${r.status}`);
          return r.text();
        })
      : this.buildCsvString(csvObject!, delimiter);

    const csvPath = `temp_csv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.csv`;
    await this.db.registerFileText(csvPath, csvString);

    const qualifiedTableName = `${workspace}.${outputTableName}`;

    let loadCsvQuery: string;
    if (geometryColumns) {
      loadCsvQuery = LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY({
        csvFileUrl: csvPath,
        tableName: outputTableName,
        delimiter,
        latColumnName: geometryColumns.latColumnName,
        longColumnName: geometryColumns.longColumnName,
        sourceCrs: geometryColumns.coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT,
        targetCrs: workspaceCoordinateFormat,
        workspace,
      });
    } else {
      loadCsvQuery = LOAD_CSV_ON_TABLE_QUERY(csvPath, outputTableName, delimiter, workspace);
    }

    const describeTableResponse = await this.conn.query(loadCsvQuery);

    // Automatically create spatial index for geometry column
    if (geometryColumns) {
      const indexName = `idx_${outputTableName}_geometry`;
      await this.conn.query(`CREATE INDEX ${indexName} ON ${qualifiedTableName} USING RTREE (${DEFAULT_GEO_COLUMN_NAME});`);
    }

    await this.db.dropFile(csvPath);

    return {
      source: 'csv',
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
