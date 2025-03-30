import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SpatialJoinParams } from './interfaces';
import { Table } from '../../../shared/interfaces';
import { GeometryColumnNotFoundError, TableNotFoundError } from './errors';
import { SPATIAL_JOIN_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export class SpatialJoinUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: SpatialJoinParams, tables: Table[]): Promise<Table> {
    const tableRoot = tables.find((table) => table.name === params.tableRootName);
    if (!tableRoot) throw new TableNotFoundError(params.tableRootName);

    const tableJoin = tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);

    const geometricColumnRoot = tableRoot.columns.find((column) => column.type === 'GEOMETRY')?.name;
    if (!geometricColumnRoot) throw new GeometryColumnNotFoundError(tableJoin.name);

    const geometricColumnJoin = tableJoin.columns.find((column) => column.type === 'GEOMETRY')?.name;
    if (!geometricColumnJoin) throw new GeometryColumnNotFoundError(tableRoot.name);

    const joinType = params.joinType || 'INNER';
    const spatialPredicate = params.spatialPredicate || 'INTERSECT';

    const query = SPATIAL_JOIN_QUERY({
      tableRoot,
      tableJoin,
      geometricColumnRoot,
      geometricColumnJoin,
      joinType,
      spatialPredicate,
      groupBy: this.addTablesToGroupBy(params.groupBy, tables),
      nearDistance: params.nearDistance,
    });
    console.log({ query });
    const tableDescribeResponse = await this.conn.query(`
        CREATE TABLE ${params.outputTableName} AS
        ${query}

        DESCRIBE ${params.outputTableName};
      `);

    return {
      type: tableRoot.type,
      name: params.outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
    };
  }

  private addTablesToGroupBy(
    groupBy: SpatialJoinParams['groupBy'],
    tables: Table[],
  ): {
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string }>;
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
        };
      }),
    };
  }
}
