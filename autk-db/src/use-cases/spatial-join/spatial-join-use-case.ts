import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SpatialQueryParams } from './interfaces';
import { Table } from '../../interfaces';
import { GeometryColumnNotFoundError, TableNotFoundError } from './errors';
import { SPATIAL_JOIN_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';

/**
 * Performs a spatial join between two tables, with optional aggregation.
 *
 * The join always modifies the root table in place using a LEFT join.
 */
export class SpatialJoinUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: SpatialQueryParams, tables: Table[], workspace: string): Promise<Table> {
    const tableRoot = tables.find((table) => table.name === params.tableRootName);
    if (!tableRoot) throw new TableNotFoundError(params.tableRootName);

    const tableJoin = tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);

    const geometricColumnRoot = this.getGeometryColumnName(tableRoot);
    if (!geometricColumnRoot) throw new GeometryColumnNotFoundError(tableRoot.name);

    const geometricColumnJoin = this.getGeometryColumnName(tableJoin);
    if (!geometricColumnJoin) throw new GeometryColumnNotFoundError(tableJoin.name);

    const spatialPredicate = params.spatialPredicate || 'INTERSECT';

    let nearUseCentroid = params.nearUseCentroid;
    if (nearUseCentroid === undefined && spatialPredicate === 'NEAR') {
      nearUseCentroid = await this.isPolygonTable(tableRoot.name, geometricColumnRoot, workspace);
    }

    const qualifiedOutputTableName = `${workspace}.${tableRoot.name}`;
    const query = SPATIAL_JOIN_QUERY({
      workspace,
      tableRoot,
      tableJoin,
      geometricColumnRoot,
      geometricColumnJoin,
      spatialPredicate,
      groupBy: params.groupBy ? { selectColumns: params.groupBy.selectColumns } : null,
      nearDistance: params.nearDistance,
      nearUseCentroid,
    });

    const tableDescribeResponse = await this.conn.query(`
        CREATE OR REPLACE TABLE ${qualifiedOutputTableName} AS
        ${query}

        DESCRIBE ${qualifiedOutputTableName};
      `);

    return {
      source: tableRoot.source,
      type: tableRoot.type,
      name: tableRoot.name,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
      bands: tableRoot.bands,
    } as Table;
  }

  /**
   * Determines whether the table stores polygon geometries.
   *
   * @param tableName - name of the table to inspect.
   * @param geomColumn - name of the geometry column.
   * @param workspace - workspace namespace qualifying the table name.
   * @returns `true` if the table contains polygon or multipolygon geometry.
   */
  private async isPolygonTable(tableName: string, geomColumn: string, workspace: string): Promise<boolean> {
    const qualifiedTableName = `${workspace}.${tableName}`;
    const result = await this.conn.query(
      `SELECT ST_GeometryType("${geomColumn}") AS geom_type FROM ${qualifiedTableName} WHERE "${geomColumn}" IS NOT NULL LIMIT 1`
    );
    const rows = result.toArray();
    if (rows.length === 0) return false;
    const geomType = String(rows[0].geom_type).toUpperCase();
    return geomType === 'POLYGON' || geomType === 'MULTIPOLYGON';
  }

  /**
   * Returns the geometry column name for a table.
   *
   * For building tables, prioritizes `agg_geometry` if available, otherwise falls back to `geometry`.
   *
   * @param table - table metadata to inspect.
   * @returns the geometry column name, or `undefined` if none found.
   */
  private getGeometryColumnName(table: Table): string | undefined {
    if (table.source === 'osm' && table.type === 'buildings') {
      const aggGeometryColumn = table.columns.find(
        (column) => column.name === 'agg_geometry' && column.type === 'GEOMETRY',
      );

      if (aggGeometryColumn) return aggGeometryColumn.name;
    }

    return table.columns.find((column) => column.type === 'GEOMETRY')?.name;
  }
}
