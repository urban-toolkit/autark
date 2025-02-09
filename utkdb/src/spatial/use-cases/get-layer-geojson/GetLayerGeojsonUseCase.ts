import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';

export class GetLayerGeojsonUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  // TODO: create geojson type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async exec(tableName: string): Promise<any> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(tableName);
    const response = await this.conn.query(query);

    return response.toArray()[0]?.geojson;
  }
}
