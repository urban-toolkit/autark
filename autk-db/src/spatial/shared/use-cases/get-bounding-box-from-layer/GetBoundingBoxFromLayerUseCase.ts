import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { GetBoundingBoxFromLayerParams } from './interfaces';
import { BoundingBox } from '../../../../shared/interfaces';
import { GET_BOUNDING_BOX_FROM_LAYER_QUERY } from './queries';

export class GetBoundingBoxFromLayerUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: GetBoundingBoxFromLayerParams): Promise<BoundingBox> {
    const workspace = params.workspace || 'main';
    const result = await this.conn.query(GET_BOUNDING_BOX_FROM_LAYER_QUERY(params.layerTableName, workspace));
    const rows = result.toArray();

    if (rows.length === 0) {
      throw new Error(`Could not calculate bounding box - no geometries found in table ${params.layerTableName}`);
    }

    const row = rows[0];

    // Validate that we have valid coordinates
    if (row.minLon == null || row.minLat == null || row.maxLon == null || row.maxLat == null) {
      throw new Error(`Could not calculate bounding box - invalid coordinates found in table ${params.layerTableName}`);
    }

    return {
      minLon: row.minLon,
      minLat: row.minLat,
      maxLon: row.maxLon,
      maxLat: row.maxLat,
    };
  }
}
