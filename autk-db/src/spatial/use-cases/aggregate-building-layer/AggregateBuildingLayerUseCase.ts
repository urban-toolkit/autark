import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { LayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export class AggregateBuildingLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: { inputTableName: string; outputTableName: string }): Promise<LayerTable> {
    const { inputTableName, outputTableName } = params;

    // Ensure input has building_id; if not present, this will simply fail clearly
    const query = `
      CREATE OR REPLACE TABLE ${outputTableName} AS
      SELECT
        building_id,
        -- Union all parts of the same building into a single geometry (DuckDB spatial aggregate)
        ST_Union_Agg(geometry) AS geometry,
        -- Pick a deterministic representative properties row (smallest id)
        arg_min(properties, id) AS properties
      FROM ${inputTableName}
      -- Keep only valid polygonal geometries to avoid topology errors during union
      WHERE ST_IsValid(geometry)
      GROUP BY building_id;

      DESCRIBE ${outputTableName};
    `;

    const describe = await this.conn.query(query);

    return {
      source: 'osm',
      type: 'buildings',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describe.toArray()),
    };
  }
}
