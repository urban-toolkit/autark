import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export class AggregateBuildingLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: { inputTableName: string; workspace?: string }): Promise<void> {
    const { inputTableName, workspace = 'main' } = params;
    const qualifiedTableName = `${workspace}.${inputTableName}`;
    const tempTableName = `${inputTableName}_temp_agg`;

    // Create temporary table with aggregated geometries
    const createTempQuery = `
      CREATE OR REPLACE TEMP TABLE ${tempTableName} AS
      SELECT
        building_id,
        -- Union all parts of the same building into a single geometry (DuckDB spatial aggregate)
        ST_Union_Agg(geometry) AS agg_geometry
      FROM ${qualifiedTableName}
      -- Keep only valid polygonal geometries to avoid topology errors during union
      WHERE ST_IsValid(geometry)
      GROUP BY building_id;
    `;

    await this.conn.query(createTempQuery);

    // Add agg_geometry column to main table via LEFT JOIN
    const addColumnQuery = `
      CREATE OR REPLACE TABLE ${qualifiedTableName} AS
      SELECT 
        b.*,
        agg.agg_geometry
      FROM ${qualifiedTableName} b
      LEFT JOIN ${tempTableName} agg ON b.building_id = agg.building_id;
    `;

    await this.conn.query(addColumnQuery);

    // Clean up temp table
    await this.conn.query(`DROP TABLE IF EXISTS ${tempTableName};`);
  }
}
