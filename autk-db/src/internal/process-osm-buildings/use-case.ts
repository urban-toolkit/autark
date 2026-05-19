import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { computeIntersectingClusterIds } from '../../types-core';
import { Column } from '../../interfaces';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';
import { ProcessOsmBuildingsParams } from './interfaces';
import {
  SELECT_BUILDING_GEOMETRY_QUERY,
  ALTER_ADD_BUILDING_ID_QUERY,
  CREATE_TEMP_JSON_TABLE_QUERY,
  CREATE_TEMP_IDS_TABLE_QUERY,
  UPDATE_BUILDING_IDS_QUERY,
  DROP_TEMP_IDS_TABLE_QUERY,
  DROP_TEMP_JSON_TABLE_QUERY,
  PRAGMA_TABLE_INFO_QUERY,
  DESCRIBE_TABLE_QUERY,
  SELECT_BUILDING_IDS_QUERY,
  CREATE_TEMP_AGG_TABLE_QUERY,
  BATCH_INSERT_QUERY,
  SINGLE_INSERT_QUERY,
  NULL_INSERT_QUERY,
  ADD_AGG_COLUMN_QUERY,
  NULL_COUNT_QUERY,
  DROP_TEMP_TABLE_QUERY,
} from './queries';

const BATCH_SIZE = 100;

/**
 * Assigns grouped `building_id` values and computes aggregated building geometry for OSM building parts.
 */
export class ProcessOsmBuildingsUseCase {
  /**
   * @param db DuckDB instance.
   * @param conn Active DuckDB connection.
   */
  constructor(
    private db: AsyncDuckDB,
    private conn: AsyncDuckDBConnection,
  ) {}

  /**
   * Executes the building processing pipeline: assigns building IDs and aggregates geometry.
   * @param params Configuration for the processing operation.
   * @returns The column definitions of the updated table.
   * @example const columns = await useCase.exec({ tableName: 'osm_buildings' });
   */
  async exec(params: ProcessOsmBuildingsParams): Promise<Column[]> {
    const { tableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedTableName = `${workspace}.${tableName}`;

    const res = await this.conn.query(SELECT_BUILDING_GEOMETRY_QUERY(qualifiedTableName));
    const rows = res.toArray();
    const items = rows.map((r: any) => ({ id: r.id as number, geometry: JSON.parse(r.geometry_json) as any }));
    const idToCluster = computeIntersectingClusterIds(items);

    if (idToCluster.size > 0) {
      const hasBuildingId = await this.columnExists(qualifiedTableName, 'building_id');
      if (!hasBuildingId) {
        await this.conn.query(ALTER_ADD_BUILDING_ID_QUERY(qualifiedTableName));
      }

      const jsonRows = Array.from(idToCluster.entries()).map(([id, building_id]) => ({ id: Number(id), building_id }));
      const vfsPath = `tmp_building_ids_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`;
      await this.db.registerFileText(vfsPath, JSON.stringify({ rows: jsonRows }));

      await this.conn.query(CREATE_TEMP_JSON_TABLE_QUERY(vfsPath));
      await this.conn.query(CREATE_TEMP_IDS_TABLE_QUERY());
      await this.conn.query(UPDATE_BUILDING_IDS_QUERY(qualifiedTableName));
      await this.conn.query(DROP_TEMP_IDS_TABLE_QUERY());
      await this.conn.query(DROP_TEMP_JSON_TABLE_QUERY());
      await this.db.dropFile(vfsPath);
    }

    await this.aggregateGeometry(qualifiedTableName, tableName);

    return await this.describeColumns(qualifiedTableName);
  }

  /**
   * Aggregates building geometry by grouping on `building_id`.
   * @param qualifiedTableName The workspace-qualified table name.
   * @param tableName The unqualified table name (used for temp table naming).
   * @private
   */
  private async aggregateGeometry(qualifiedTableName: string, tableName: string): Promise<void> {
    const tempTableName = `${tableName}_temp_agg`;
    const result = await this.conn.query(SELECT_BUILDING_IDS_QUERY(qualifiedTableName));
    const buildingIds: bigint[] = result.toArray().map((r: any) => r.building_id as bigint);

    await this.conn.query(CREATE_TEMP_AGG_TABLE_QUERY(tempTableName));

    for (let i = 0; i < buildingIds.length; i += BATCH_SIZE) {
      const batch = buildingIds.slice(i, i + BATCH_SIZE);
      const ids = batch.map(id => String(id)).join(',');

      try {
        await this.conn.query(BATCH_INSERT_QUERY(qualifiedTableName, tempTableName, ids));
      } catch (_error) {
        for (const bid of batch) {
          try {
            await this.conn.query(SINGLE_INSERT_QUERY(qualifiedTableName, tempTableName, String(bid)));
          } catch (_e) {
            console.warn(
              `[ProcessOsmBuildings] failed for building_id=${String(bid)}:`,
              (_e as Error).message,
            );
            await this.conn.query(NULL_INSERT_QUERY(tempTableName, String(bid)));
          }
        }
      }
    }

    await this.conn.query(ADD_AGG_COLUMN_QUERY(qualifiedTableName, tempTableName));

    const nullCount = (await this.conn.query(NULL_COUNT_QUERY(qualifiedTableName))).toArray()[0]?.cnt as number;
    if (nullCount > 0) {
      console.warn(`[ProcessOsmBuildings] ${nullCount} rows have no agg_geometry (union failed)`);
    }

    await this.conn.query(DROP_TEMP_TABLE_QUERY(tempTableName));
  }

  /**
   * Checks whether a column exists in the given table.
   * @param tableName The workspace-qualified table name.
   * @param columnName The column name to look for.
   * @returns `true` if the column exists, `false` otherwise.
   * @private
   */
  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const pragma = await this.conn.query(PRAGMA_TABLE_INFO_QUERY(tableName));
    const arr = pragma?.toArray?.() ?? [];
    return arr.some((r: any) => String(r.name) === columnName);
  }

  /**
   * Retrieves the column definitions of a table.
   * @param tableName The workspace-qualified table name.
   * @returns An array of column objects with `name` and `type`.
   * @private
   */
  private async describeColumns(tableName: string): Promise<Column[]> {
    const describe = await this.conn.query(DESCRIBE_TABLE_QUERY(tableName));
    const rows = describe?.toArray?.() ?? [];
    return rows.map((r: any) => ({ name: r[0] ?? r.column_name ?? r.name, type: r[1] ?? r.column_type ?? r.type }));
  }
}
