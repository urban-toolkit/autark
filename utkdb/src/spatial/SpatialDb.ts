/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { loadDb } from '../config/duckdb';
import { QUERY_PARKS_LINESTRINGS } from './queries/parks';

export type DbResponse = {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
};

export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  async getParks(pbfFileUrl: string): Promise<Array<DbResponse>> {
    if (!this.db || !this.conn) throw new Error('Database not initialized. Please call init() first.');

    const query = QUERY_PARKS_LINESTRINGS(pbfFileUrl);
    const response = await this.conn.query(query); // TODO: type it and fix any's

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
