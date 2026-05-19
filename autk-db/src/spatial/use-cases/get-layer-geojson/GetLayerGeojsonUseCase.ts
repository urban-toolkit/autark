import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';
import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';

/**
 * Exports a layer table as a GeoJSON FeatureCollection.
 */
export class GetLayerGeojsonUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(table: LayerTable | CustomLayerTable, workspace: string = 'main'): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(table, workspace);
    const response = await this.conn.query(query);

    const raw: string = response.toArray()[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
    return JSON.parse(raw.replace(/\bNaN\b/g, 'null')) as FeatureCollection;
  }
}
