import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';
import { GetLayerOptions } from './interfaces';
import { Table } from '../../interfaces';
import type { LayerType } from '@urban-toolkit/autk-core';
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
   * The returned FeatureCollection always includes `__autk_layer` at the root,
   * and any duplicated per-feature `properties.__autk_layer` values are removed.
   *
   * @param table - The layer table with its type and column metadata.
   * @param workspace - Workspace (schema) name; defaults to `autk`.
   * @param options - Export options; `osmElements` exports one feature per OSM element.
   * @returns A GeoJSON FeatureCollection representing the layer data.
   * @throws If the DuckDB query fails or the response cannot be parsed as GeoJSON.
   */
  async exec(
    table: Table & { type: LayerType },
    workspace: string = DEFAULT_WORKSPACE_NAME,
    options: GetLayerOptions = {},
  ): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(table, workspace, options);
    const response = await this.conn.query(query);

    const raw: string = response.toArray()[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
    const featureCollection = JSON.parse(raw.replace(/\bNaN\b/g, 'null')) as FeatureCollection & { __autk_layer?: LayerType };

    featureCollection.__autk_layer = table.type;

    for (const feature of featureCollection.features) {
      if (!feature.properties || typeof feature.properties !== 'object' || !('__autk_layer' in feature.properties)) continue;
      delete (feature.properties as Record<string, unknown>).__autk_layer;
    }

    return featureCollection;
  }
}
