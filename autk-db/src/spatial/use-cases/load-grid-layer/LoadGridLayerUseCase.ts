import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { BoundingBox, GridLayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export interface LoadGridLayerParams {
  boundingBox?: BoundingBox;
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

    if (!boundingBox) {
      throw new Error('Bounding box is required to load a grid layer.');
    }

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

    // 2. Generate grid cell centroids in JS and bulk-insert
    const lonStep = (maxLon - minLon) / columns;
    const latStep = (maxLat - minLat) / rows;

    const values: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        // Calculate the center point of each grid cell
        const centerLon = minLon + (c + 0.5) * lonStep;
        const centerLat = minLat + (r + 0.5) * latStep;

        values.push(`(ST_Point(${centerLon}, ${centerLat}), {'row': ${r}, 'column': ${c}})`);
      }
    }

    const insertSql = `INSERT INTO ${outputTableName} VALUES ${values.join(',')};`;

    await this.conn.query(insertSql);

    // 3. Create spatial index on geometry column
    const createIndexSql = `CREATE INDEX idx_${outputTableName}_geometry ON ${outputTableName} USING RTREE (geometry);`;
    await this.conn.query(createIndexSql);

    const describeTableResponse = await this.conn.query(`DESCRIBE ${outputTableName}`);

    return {
      source: 'user',
      type: 'raster',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
    };
  }
}
