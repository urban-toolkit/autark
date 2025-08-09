import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Column } from '../../../shared/interfaces';
import { computeIntersectingClusterIds } from '../../../shared/clusterIntersectingFeatures';

export class AssignBuildingIdsUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Reads geometries from the provided building table, computes intersecting
   * clusters in JS, writes a stable building_id per row back to the table, and
   * returns the updated column list for the table.
   */
  async exec(params: { tableName: string }): Promise<Column[]> {
    const { tableName } = params;

    // Read id and geometry as GeoJSON for JS processing
    const selectSql = `
      SELECT id, CAST(ST_AsGeoJSON(geometry) AS JSON) AS geometry_json
      FROM ${tableName}
    `;
    const res = await this.conn.query(selectSql);
    const rows = res.toArray();

    const items = rows.map((r: any) => ({ id: r.id as number, geometry: JSON.parse(r.geometry_json) as any }));

    const idToCluster = computeIntersectingClusterIds(items);

    // Skip if nothing to assign
    if (idToCluster.size === 0) {
      return await this.describeColumns(tableName);
    }

    // Ensure building_id column exists
    const hasBuildingId = await this.columnExists(tableName, 'building_id');
    if (!hasBuildingId) {
      await this.conn.query(`ALTER TABLE ${tableName} ADD COLUMN building_id BIGINT`);
    }

    // Bulk insert using an in-memory JSON file (same pattern as custom layer loader)
    const jsonRows = Array.from(idToCluster.entries()).map(([id, building_id]) => ({ id: Number(id), building_id }));
    const vfsPath = `tmp_building_ids_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`;
    await this.db.registerFileText(vfsPath, JSON.stringify({ rows: jsonRows }));

    await this.conn.query(`CREATE TEMP TABLE __tmp_building_ids_json AS SELECT * FROM '${vfsPath}'`);
    await this.conn.query(`
      CREATE TEMP TABLE __tmp_building_ids AS
      SELECT CAST(row.id AS BIGINT) AS id, CAST(row.building_id AS BIGINT) AS building_id
      FROM (SELECT UNNEST(rows) AS row FROM __tmp_building_ids_json);
    `);

    // Update table by joining on id
    await this.conn.query(
      `UPDATE ${tableName} AS t SET building_id = b.building_id FROM __tmp_building_ids AS b WHERE t.id = b.id`,
    );

    // Cleanup temp table
    await this.conn.query(`DROP TABLE __tmp_building_ids`);
    await this.conn.query(`DROP TABLE __tmp_building_ids_json`);
    await this.db.dropFile(vfsPath);

    return await this.describeColumns(tableName);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const pragma = await this.conn.query(`PRAGMA table_info('${tableName}')`);
    const arr = pragma?.toArray?.() ?? [];
    return arr.some((r: any) => String(r.name) === columnName);
  }

  private async describeColumns(tableName: string): Promise<Column[]> {
    const describe = await this.conn.query(`DESCRIBE ${tableName}`);
    const rows = describe?.toArray?.() ?? [];
    return rows.map((r: any) => ({ name: r[0] ?? r.column_name ?? r.name, type: r[1] ?? r.column_type ?? r.type }));
  }
}
