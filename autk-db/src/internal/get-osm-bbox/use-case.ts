import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import type { BoundingBox } from '../../types-core';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { GetOsmBboxParams } from './interfaces';
import { GET_OSM_BBOX_QUERY } from './queries';

/**
 * Computes the geographic bounding box of an OSM boundary table.
 */
export class GetOsmBboxUseCase {
  /**
   * @param conn DuckDB connection used for querying.
   */
  constructor(private conn: AsyncDuckDBConnection) {}

  /**
   * Queries the spatial extent of boundary way geometries in an OSM table.
   *
   * @param params Configuration for the bounding box calculation.
   * @returns The calculated geographic bounding box.
   * @throws Error if the table has no coordinates or contains invalid values.
   * @example
   * const useCase = new GetOsmBboxUseCase(conn);
   * const bbox = await useCase.exec({ osmTableName: 'osm_ways' });
   * console.log(bbox.minLon);
   */
  async exec(params: GetOsmBboxParams): Promise<BoundingBox> {
    const workspace = params.workspace || DEFAULT_WORKSPACE_NAME;
    const result = await this.conn.query(
      GET_OSM_BBOX_QUERY(params.osmTableName, workspace, params.coordinateFormat),
    );
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
