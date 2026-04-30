import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

const BATCH_SIZE = 100;

/**
 * Aggregates building geometries by `building_id` into union geometries.
 */
export class AggregateBuildingLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: { inputTableName: string; workspace?: string }): Promise<void> {
    const { inputTableName, workspace = 'main' } = params;
    const qualifiedTableName = `${workspace}.${inputTableName}`;
    const tempTableName = `${inputTableName}_temp_agg`;

    const result = await this.conn.query(`
      SELECT building_id
      FROM ${qualifiedTableName}
      WHERE building_id IS NOT NULL
      GROUP BY building_id
    `);
    const buildingIds: bigint[] = result.toArray().map((r: any) => r.building_id as bigint);

    await this.conn.query(`CREATE OR REPLACE TEMP TABLE ${tempTableName} (building_id BIGINT, agg_geometry BLOB)`);

    for (let i = 0; i < buildingIds.length; i += BATCH_SIZE) {
      const batch = buildingIds.slice(i, i + BATCH_SIZE);
      const ids = batch.map(id => String(id)).join(',');

      const query = `
        INSERT INTO ${tempTableName}
        SELECT
          building_id,
          ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
        FROM ${qualifiedTableName}
        WHERE building_id IN (${ids})
          AND ST_IsValid(geometry)
        GROUP BY building_id;
      `;

      try {
        await this.conn.query(query);
      } catch (_error) {
        for (const bid of batch) {
          try {
            await this.conn.query(`
              INSERT INTO ${tempTableName}
              SELECT
                ${String(bid)} AS building_id,
                ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
              FROM ${qualifiedTableName}
              WHERE building_id = ${String(bid)}
                AND ST_IsValid(geometry)
              GROUP BY building_id;
            `);
          } catch (_e) {
            console.warn(
              `[AggregateBuildingLayer] failed for building_id=${String(bid)}:`,
              (_e as Error).message,
            );
            await this.conn.query(`
              INSERT INTO ${tempTableName} (building_id, agg_geometry)
              VALUES (${String(bid)}, NULL);
            `);
          }
        }
      }
    }

    const addColumnQuery = `
      CREATE OR REPLACE TABLE ${qualifiedTableName} AS
      SELECT
        b.*,
        agg.agg_geometry
      FROM ${qualifiedTableName} b
      LEFT JOIN ${tempTableName} agg ON b.building_id = agg.building_id;
    `;

    await this.conn.query(addColumnQuery);

    const nullCount = (
      await this.conn.query(`
        SELECT COUNT(*) AS cnt
        FROM ${qualifiedTableName}
        WHERE agg_geometry IS NULL
      `)
    ).toArray()[0]?.cnt as number;

    if (nullCount > 0) {
      console.warn(`[AggregateBuildingLayer] ${nullCount} rows have no agg_geometry (union failed)`);
    }

    await this.conn.query(`DROP TABLE IF EXISTS ${tempTableName};`);
  }
}