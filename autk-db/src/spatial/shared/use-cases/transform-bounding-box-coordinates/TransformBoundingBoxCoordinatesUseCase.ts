import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { TransformBoundingBoxCoordinatesParams } from './interfaces';
import { BoundingBox } from '../../../../shared/interfaces';
import { TRANSFORM_BOUNDING_BOX_COORDINATES_QUERY } from './queries';

/**
 * Transforms a bounding box between coordinate reference systems.
 */
export class TransformBoundingBoxCoordinatesUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  /**
   * Transforms bounding box coordinates using DuckDB's `ST_Transform`.
   * EPSG:4326 inputs are returned unchanged.
   *
   * @param params.boundingBox Source bounding box to transform.
   * @param params.coordinateFormat Target CRS (e.g. `EPSG:3857`).
   * @returns Transformed bounding box.
   * @throws If the coordinate transformation fails.
   */
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
