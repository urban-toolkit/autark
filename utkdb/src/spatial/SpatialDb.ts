/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { loadDb } from '../config/duckdb';
import { LOAD_PBF_ON_TABLE, GET_PARKS_LINESTRINGS } from './queries';

export type DbResponse = {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
};

export type GetParksParams = {
  pbfFileUrl: string;
  boudingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  coordinateFormat?: string;
};

export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  async getParks(params: GetParksParams): Promise<Array<DbResponse>> {
    if (!this.db || !this.conn) throw new Error('Database not initialized. Please call init() first.');
    if (!params.coordinateFormat) params.coordinateFormat = 'EPSG:4326';

    await this.conn.query(LOAD_PBF_ON_TABLE(params.pbfFileUrl, 'pbf_table', params.boudingBox));
    const response = await this.conn.query(GET_PARKS_LINESTRINGS('pbf_table', params.coordinateFormat));

    return this.parseData(response);
  }

  private parseData(response: any): DbResponse[] {
    return response.toArray().map((record: any) => {
      const metadata = record.tags?.toJSON() || {};

      return {
        metadata,
        linestring: JSON.parse(record.linestring),
      };
    });
  }
}
