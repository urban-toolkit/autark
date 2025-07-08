import { Table } from '../shared/interfaces';
import { isLayerType } from '../spatial/use-cases/load-layer/interfaces';
import {
  ColumnNotFoundError,
  TableNotFoundError,
  TableShouldBeMainTable,
  UnsupportedOperationError,
} from './shared/errors';
import { WhereParams, JoinParams, QueryParams, SelectParams, SpatialJoinParams } from './shared/interfaces';
import { tableHasColumn } from './shared/utils';
import { SelectUseCase, WhereUseCase, JoinUseCase, SpatialJoinUseCase } from './use-cases';

// TODO: filter's and select just support csv tables. Extend after MVP
export class QueryOperation {
  private queryParams: QueryParams;
  private selectUseCase: SelectUseCase;
  private whereUseCase: WhereUseCase;
  private joinUseCase: JoinUseCase;
  private spatialJoinUseCase: SpatialJoinUseCase;
  private tables: Array<Table>;

  constructor(tableName: string, tables: Array<Table>) {
    this.tables = tables;

    const table = tables.find((table) => table.name === tableName);
    if (!table) throw new TableNotFoundError(tableName);

    this.queryParams = {
      table,
      wheres: [],
      selects: [],
      joins: [],
      spatialJoins: [],
    };
    this.selectUseCase = new SelectUseCase();
    this.whereUseCase = new WhereUseCase();
    this.joinUseCase = new JoinUseCase();
    this.spatialJoinUseCase = new SpatialJoinUseCase();
  }

  // TODO: just support string filter.
  // TODO: support filter for properties
  where(params: WhereParams): QueryOperation {
    const table = this.validateAndGetWhereTable(params);

    this.queryParams.wheres.push({
      table,
      column: params.column,
      value: params.value,
    });
    return this;
  }

  select(params: SelectParams): QueryOperation {
    const table = this.validateAndGetSelectTable(params);

    this.queryParams.selects.push({
      table,
      columns: params.columns,
    });
    return this;
  }

  join(params: JoinParams): QueryOperation {
    const { tableJoin, tableRoot } = this.validateAndGetJoinTables(params);

    this.queryParams.joins.push({
      tableRoot,
      columnRoot: params.columnRoot,
      tableJoin,
      columnJoin: params.columnJoin,
      joinType: params.joinType,
    });
    return this;
  }

  spatialJoin(params: SpatialJoinParams): QueryOperation {
    const { tableRoot, tableJoin } = this.validateAndGetSpatialJoinTables(params);

    this.queryParams.spatialJoins.push({
      tableRoot,
      tableJoin,
      spatialPredicate: params.spatialPredicate || 'INTERSECT',
      joinType: params.joinType,
      nearDistance: params.nearDistance,
    });
    return this;
  }

  getSql(): string {
    return `
      ${this.selectUseCase.exec(this.queryParams.selects, this.queryParams)}
      from ${this.queryParams.table.name}
      ${this.joinUseCase.exec(this.queryParams.joins)}
      ${this.spatialJoinUseCase.exec(this.queryParams.spatialJoins)}
      ${this.whereUseCase.exec(this.queryParams.wheres)}
      ;
      `;
  }

  getMainTable(): Table {
    return this.queryParams.table;
  }

  private validateAndGetWhereTable(params: WhereParams): Table {
    const table = this.tables.find((table) => table.name === params.tableName);
    if (!table) throw new TableNotFoundError(params.tableName as string);

    const hasColumn = tableHasColumn(table, params.column);
    if (!hasColumn) throw new ColumnNotFoundError(table, params.column);

    const whereAlreadyExists = this.queryParams.wheres.find((where) => where.table.name === table.name);
    if (whereAlreadyExists)
      throw new UnsupportedOperationError(table, 'where', 'Table already have a where on operation');

    return table;
  }

  private validateAndGetSelectTable(params: SelectParams): Table {
    const table = this.tables.find((table) => table.name === params.tableName);
    if (!table) throw new TableNotFoundError(params.tableName as string);

    const notFoundColumns = params.columns.filter((column) => !tableHasColumn(table, column));
    if (notFoundColumns.length > 0) {
      throw new ColumnNotFoundError(table, notFoundColumns.join(', '));
    }

    const selectAlreadyExists = this.queryParams.selects.find((select) => select.table.name === table.name);
    if (selectAlreadyExists)
      throw new UnsupportedOperationError(table, 'select', 'Table already selected on operation');

    return table;
  }

  private validateAndGetJoinTables(params: JoinParams): { tableRoot: Table; tableJoin: Table } {
    let tableRoot: Table | undefined;
    if (params.tableRootName === this.queryParams.table.name) {
      tableRoot = this.queryParams.table;
    } else {
      tableRoot = this.queryParams.joins.find((join) => join.tableJoin.name === params.tableRootName)?.tableJoin;
    }
    if (!tableRoot) throw new TableNotFoundError(params.tableRootName);
    if (!tableHasColumn(tableRoot, params.columnRoot)) throw new ColumnNotFoundError(tableRoot, params.columnRoot);

    const tableJoin = this.tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);
    if (!tableHasColumn(tableJoin, params.columnJoin)) throw new ColumnNotFoundError(tableJoin, params.columnJoin);

    return {
      tableJoin,
      tableRoot,
    };
  }

  private validateAndGetSpatialJoinTables(params: SpatialJoinParams): { tableRoot: Table; tableJoin: Table } {
    if (this.queryParams.table.name !== params.tableRootName) throw new TableShouldBeMainTable(params.tableRootName);
    const table = this.queryParams.table;

    if (!isLayerType(table.type))
      throw new UnsupportedOperationError(
        table,
        'spatialJoin',
        'Only Layer tables are supported for now on spatialJoin method as tableRoot',
      );

    const tableJoin = this.tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);
    const hasGeometry = tableJoin.columns.find((column) => column.type === 'GEOMETRY');
    if (!hasGeometry)
      throw new UnsupportedOperationError(
        tableJoin,
        'spatialJoin',
        'Your join table should have a geometry column to use spatialJoin',
      );

    if (params.spatialPredicate === 'NEAR' && !params.nearDistance)
      throw new UnsupportedOperationError(tableJoin, 'spatialJoin', 'You should pass nearDistance on NEAR joinType');

    return { tableRoot: table, tableJoin };
  }
}
