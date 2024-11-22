import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Table } from './shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadPbfUseCase, LoadPbfParams } from './use-cases/load-pbf';
import { GetLayerUseCase, GetLayerParams, Layer } from './use-cases/get-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';

export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  private tables: Array<Table> = [];
  private loadPbfUseCase?: LoadPbfUseCase;
  private getLayerUseCase?: GetLayerUseCase;
  private loadCsvUseCase?: LoadCsvUseCase;

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.loadPbfUseCase = new LoadPbfUseCase(this.conn);
    this.getLayerUseCase = new GetLayerUseCase(this.conn);
    this.loadCsvUseCase = new LoadCsvUseCase(this.conn);
    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  async loadPbf(params: LoadPbfParams) {
    if (!this.db || !this.conn || !this.loadPbfUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadPbfUseCase.exec(params);
    this.tables.push(table);
  }

  async getLayer(params: GetLayerParams): Promise<Array<Layer>> {
    if (!this.db || !this.conn || !this.getLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === params.tableName);
    if (!table) throw new Error(`Table ${params.tableName} not found.`);
    if (table.type !== 'osm') throw new Error(`Table ${params.tableName} is not an OSM table.`);

    const response = await this.getLayerUseCase.exec(params);
    this.tables.push(response.table);

    return response.layers;
  }

  async loadCsv(params: LoadCsvParams) {
    if (!this.db || !this.conn || !this.loadCsvUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCsvUseCase.exec(params);
    this.tables.push(table);

    console.log('tables ', this.tables);
  }
}
