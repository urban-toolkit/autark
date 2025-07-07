import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { BoundingBox, GridLayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export interface LoadGridLayerParams {
  boundingBox: BoundingBox;
  rows: number;
  columns: number;
  outputTableName: string;
}

export class LoadGridLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: LoadGridLayerParams): Promise<GridLayerTable> {
    const { boundingBox, rows, columns, outputTableName } = params;

    if (rows <= 0 || columns <= 0) {
      throw new Error('Rows and columns must be positive integers.');
    }

    const { minLon, minLat, maxLon, maxLat } = boundingBox;

    // 1. Create (or replace) empty table
    const createTableSql = `CREATE OR REPLACE TABLE ${outputTableName} (
      geometry GEOMETRY,
      properties STRUCT(row INTEGER, "column" INTEGER)
    );`;

    await this.conn.query(createTableSql);

    // 2. Generate grid cells in JS and bulk-insert
    const lonStep = (maxLon - minLon) / columns;
    const latStep = (maxLat - minLat) / rows;

    const values: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const west = minLon + c * lonStep;
        const south = minLat + r * latStep;
        const east = west + lonStep;
        const north = south + latStep;

        values.push(`(ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}), {'row': ${r}, 'column': ${c}})`);
      }
    }

    const insertSql = `INSERT INTO ${outputTableName} VALUES ${values.join(',')};`;

    await this.conn.query(insertSql);

    const describeTableResponse = await this.conn.query(`DESCRIBE ${outputTableName}`);

    return {
      source: 'user',
      type: 'grid',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
    };
  }
}
