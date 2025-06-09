import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { TransformBoundingBoxCoordinatesParams, BoundingBox } from './interfaces';
import { TRANSFORM_BOUNDING_BOX_COORDINATES_QUERY } from './queries';

export class TransformBoundingBoxCoordinatesUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: TransformBoundingBoxCoordinatesParams): Promise<BoundingBox> {
    // If already in EPSG:4326, no conversion needed
    if (params.coordinateFormat === 'EPSG:4326') {
      return {
        minLon: params.boundingBox.minLon,
        minLat: params.boundingBox.minLat,
        maxLon: params.boundingBox.maxLon,
        maxLat: params.boundingBox.maxLat,
      };
    }

    // Transform coordinates using DuckDB's ST_Transform function
    const result = await this.conn.query(
      TRANSFORM_BOUNDING_BOX_COORDINATES_QUERY({
        boundingBox: params.boundingBox,
        coordinateFormat: params.coordinateFormat,
      }),
    );
    const rows = result.toArray();

    if (rows.length === 0) {
      throw new Error('Could not transform bounding box coordinates');
    }

    return {
      minLon: rows[0].minLon,
      minLat: rows[0].minLat,
      maxLon: rows[0].maxLon,
      maxLat: rows[0].maxLat,
    };
  }
}
