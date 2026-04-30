import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SpatialQueryParams } from './interfaces';
import { Table } from '../../../shared/interfaces';
import { GeometryColumnNotFoundError, TableNotFoundError } from './errors';
import { SPATIAL_JOIN_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

/**
 * Performs a spatial join between two tables, with optional aggregation.
 */
export class SpatialJoinUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: SpatialQueryParams, tables: Table[]): Promise<{ created: boolean; table: Table }> {
    const tableRoot = tables.find((table) => table.name === params.tableRootName);
    if (!tableRoot) throw new TableNotFoundError(params.tableRootName);

    const tableJoin = tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);

    const geometricColumnRoot = this.getGeometryColumnName(tableRoot);
    if (!geometricColumnRoot) throw new GeometryColumnNotFoundError(tableRoot.name);

    const geometricColumnJoin = this.getGeometryColumnName(tableJoin);
    if (!geometricColumnJoin) throw new GeometryColumnNotFoundError(tableJoin.name);

    const joinType = params.joinType || 'INNER';
    const spatialPredicate = params.spatialPredicate || 'INTERSECT';

    let nearUseCentroid = params.nearUseCentroid;
    if (nearUseCentroid === undefined && spatialPredicate === 'NEAR') {
      nearUseCentroid = await this.isPolygonTable(tableRoot.name, geometricColumnRoot);
    }

    const outputTableName = (params.output.type === 'CREATE_NEW' ? params.output.tableName : tableRoot.name) as string;
    const query = SPATIAL_JOIN_QUERY({
      tableRoot,
      tableJoin,
      geometricColumnRoot,
      geometricColumnJoin,
      joinType,
      spatialPredicate,
      groupBy: this.addTablesToGroupBy(params.groupBy, tables),
      nearDistance: params.nearDistance,
      nearUseCentroid,
      outputTableName,
    });

    // console.log({ query });
    const tableDescribeResponse = await this.conn.query(`
        CREATE OR REPLACE TABLE ${outputTableName} AS
        ${query}

        DESCRIBE ${outputTableName};
      `);

    return {
      table: {
        source: tableRoot.source,
        type: tableRoot.type,
        name: outputTableName,
        columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
      } as Table,
      created: params.output.type === 'CREATE_NEW',
    };
  }

  /**
   * Gets the appropriate geometry column name for a table.
   * For building tables, prioritizes 'agg_geometry' if available, otherwise falls back to 'geometry'.
   * For other tables, returns the first geometry column found.
   */
  private async isPolygonTable(tableName: string, geomColumn: string): Promise<boolean> {
    const result = await this.conn.query(
      `SELECT ST_GeometryType("${geomColumn}") AS geom_type FROM ${tableName} WHERE "${geomColumn}" IS NOT NULL LIMIT 1`
    );
    const rows = result.toArray();
    if (rows.length === 0) return false;
    const geomType = String(rows[0].geom_type).toUpperCase();
    return geomType === 'POLYGON' || geomType === 'MULTIPOLYGON';
  }

  private getGeometryColumnName(table: Table): string | undefined {
    if (table.source === 'osm' && table.type === 'buildings') {
      const aggGeometryColumn = table.columns.find(
        (column) => column.name === 'agg_geometry' && column.type === 'GEOMETRY',
      );

      if (aggGeometryColumn) return aggGeometryColumn.name;
    }

    // Default behavior: return first geometry column found
    return table.columns.find((column) => column.type === 'GEOMETRY')?.name;
  }

  private addTablesToGroupBy(
    groupBy: SpatialQueryParams['groupBy'],
    tables: Table[],
  ): {
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string; normalize?: boolean }>;
  } | null {
    if (!groupBy) return null;

    return {
      selectColumns: groupBy.selectColumns.map((column) => {
        const table = tables.find((table) => table.name === column.tableName);
        if (!table) throw new TableNotFoundError(column.tableName);

        return {
          table,
          column: column.column,
          aggregateFn: column.aggregateFn,
          aggregateFnResultColumnName: column.aggregateFnResultColumnName,
          normalize: column.normalize,
        };
      }),
    };
  }
}
