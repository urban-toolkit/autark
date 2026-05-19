import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';
import { Table } from '../../interfaces';
import type { LayerType } from '../../types-core';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';

/**
 * Exports a layer table as a GeoJSON FeatureCollection.
 */
export class GetLayerUseCase {
  /** Active DuckDB connection used to query layer data. */
  private conn: AsyncDuckDBConnection;

  /**
   * Initializes the use case with a DuckDB connection.
   *
   * @param conn - Active async DuckDB connection for executing queries.
   */
  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  /**
   * Exports a layer as GeoJSON, handling raster and building layers specially.
   *
   * @param table - The layer table with its type and column metadata.
   * @param workspace - Workspace (schema) name; defaults to `autk`.
   * @returns A GeoJSON FeatureCollection representing the layer data.
   * @throws If the DuckDB query fails or the response cannot be parsed as GeoJSON.
   */
  async exec(table: Table & { type: LayerType }, workspace: string = DEFAULT_WORKSPACE_NAME): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(table, workspace);
    const response = await this.conn.query(query);

    const raw: string = response.toArray()[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
    return JSON.parse(raw.replace(/\bNaN\b/g, 'null')) as FeatureCollection;
  }
}
