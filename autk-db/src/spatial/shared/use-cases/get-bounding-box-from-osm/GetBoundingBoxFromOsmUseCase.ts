import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BoundingBox } from '../../../../shared/interfaces';
import { GetBoundingBoxFromOsmParams } from './interfaces';
import { GET_BOUNDING_BOX_FROM_OSM_QUERY } from './queries';

export class GetBoundingBoxFromOsmUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: GetBoundingBoxFromOsmParams): Promise<BoundingBox> {
    const workspace = params.workspace || 'main';
    const result = await this.conn.query(GET_BOUNDING_BOX_FROM_OSM_QUERY(params.osmTableName, workspace));
    const rows = result.toArray();

    if (rows.length === 0) {
      throw new Error(`Could not calculate bounding box - no coordinates found in table ${params.osmTableName}`);
    }

    const row = rows[0];

    if (row.minLon == null || row.minLat == null || row.maxLon == null || row.maxLat == null) {
      throw new Error(`Could not calculate bounding box - invalid coordinates found in table ${params.osmTableName}`);
    }

    return {
      minLon: row.minLon,
      minLat: row.minLat,
      maxLon: row.maxLon,
      maxLat: row.maxLat,
    };
  }
}
