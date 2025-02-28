import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';

export class GetLayerGeojsonUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(tableName: string): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(tableName);
    const response = await this.conn.query(query);

    return JSON.parse(response.toArray()[0]?.geojson) as FeatureCollection;
  }
}
