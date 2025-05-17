import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { GetBoundingBoxParams, BoundingBox } from './interfaces';
import { GET_BOUNDING_BOX_QUERY } from './queries';

export class GetBoundingBoxUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: GetBoundingBoxParams): Promise<BoundingBox> {
    const result = await this.conn.query(
      GET_BOUNDING_BOX_QUERY({
        tableName: params.tableName,
        coordinateFormat: params.coordinateFormat,
        layers: params.layers,
      }),
    );
    const rows = result.toArray();

    if (rows.length === 0) {
      throw new Error('Could not calculate bounding box - no nodes found in table');
    }

    return {
      minLon: rows[0].minLon,
      minLat: rows[0].minLat,
      maxLon: rows[0].maxLon,
      maxLat: rows[0].maxLat,
    };
  }
}
