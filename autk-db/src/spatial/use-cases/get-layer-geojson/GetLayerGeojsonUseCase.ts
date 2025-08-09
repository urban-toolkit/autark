import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';
import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';

export class GetLayerGeojsonUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(table: LayerTable | CustomLayerTable): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(table);
    const response = await this.conn.query(query);

    return JSON.parse(response.toArray()[0]?.geojson) as FeatureCollection;
  }
}
