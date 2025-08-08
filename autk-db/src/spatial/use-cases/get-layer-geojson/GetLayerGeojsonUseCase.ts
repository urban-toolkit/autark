import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { GET_LAYER_AS_GEOJSON_QUERY } from './queries';
import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';
import { clusterIntersectingFeatures } from '../../../shared/clusterIntersectingFeatures';

export class GetLayerGeojsonUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(table: LayerTable | CustomLayerTable): Promise<FeatureCollection> {
    const query = GET_LAYER_AS_GEOJSON_QUERY(table);
    const response = await this.conn.query(query);

    const collection = JSON.parse(response.toArray()[0]?.geojson) as FeatureCollection;

    // Special handling for building layers: group intersecting geometries.
    if (table.type === 'buildings') {
      return clusterIntersectingFeatures(collection);
    }

    return collection;
  }
}
