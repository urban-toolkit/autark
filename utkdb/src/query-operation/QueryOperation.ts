import { DEFAULT_GEO_COLUMN_NAME } from '../shared/consts';
import { Table } from '../shared/interfaces';
import {
  ColumnNotFoundError,
  TableNotFoundError,
  TableShouldBeMainTable,
  UnsupportedOperationError,
} from './shared/errors';
import { FilterParams, JoinParams, QueryParams, SelectParams, SpatialJoinParams } from './shared/interfaces';
import { tableHasColumn } from './shared/utils';
import { SelectUseCase, FilterUseCase, JoinUseCase, SpatialJoinUseCase } from './use-cases';

// TODO: filter's and select just support csv tables. Extend after MVP
export class QueryOperation {
  private queryParams: QueryParams;
  private selectUseCase: SelectUseCase;
  private filterUseCase: FilterUseCase;
  private joinUseCase: JoinUseCase;
  private spatialJoinUseCase: SpatialJoinUseCase;
  private tables: Array<Table>;

  constructor(tableName: string, tables: Array<Table>) {
    this.tables = tables;

    const table = tables.find((table) => table.name === tableName);
    if (!table) throw new TableNotFoundError(tableName);

    this.queryParams = {
      table,
      filters: [],
      selects: [],
      joins: [],
      spatialJoins: [],
    };
    this.selectUseCase = new SelectUseCase();
    this.filterUseCase = new FilterUseCase();
    this.joinUseCase = new JoinUseCase();
    this.spatialJoinUseCase = new SpatialJoinUseCase();
  }

  // TODO: just support string filter. Extend after MVP
  filter(params: FilterParams): QueryOperation {
    const table = this.validateAndGetFilterTable(params);

    this.queryParams.filters.push({
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
      ${this.selectUseCase.exec(this.queryParams.selects)}
      from ${this.queryParams.table.name}
      ${this.joinUseCase.exec(this.queryParams.joins)}
      ${this.spatialJoinUseCase.exec(this.queryParams.spatialJoins)}
      ${this.filterUseCase.exec(this.queryParams.filters)}
      ;
      `;
  }

  getMainTable(): Table {
    return this.queryParams.table;
  }

  private validateAndGetFilterTable(params: FilterParams): Table {
    const table =
      (params.tableName && this.tables.find((table) => table.name === params.tableName)) || this.queryParams.table;
    if (!table) throw new TableNotFoundError(params.tableName as string);

    if (table.type !== 'csv')
      throw new UnsupportedOperationError(table, 'filter', 'Only CSV tables are supported for now on filter method');

    const hasColumn = tableHasColumn(table, params.column);
    if (!hasColumn) throw new ColumnNotFoundError(table, params.column);

    return table;
  }

  private validateAndGetSelectTable(params: SelectParams): Table {
    const table =
      (params.tableName && this.tables.find((table) => table.name === params.tableName)) || this.queryParams.table;
    if (!table) throw new TableNotFoundError(params.tableName as string);

    if (table.type !== 'csv')
      throw new UnsupportedOperationError(table, 'select', 'Only CSV tables are supported for now on select method');

    const notFoundColumns = params.columns.filter((column) => !tableHasColumn(table, column));
    if (notFoundColumns.length > 0) {
      throw new ColumnNotFoundError(table, notFoundColumns.join(', '));
    }

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

    if (table.type !== 'layer' && table.type !== 'custom-layer')
      throw new UnsupportedOperationError(
        table,
        'spatialJoin',
        'Only Layer tables are supported for now on spatialJoin method as tableRoot',
      );

    const tableJoin = this.tables.find((table) => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);
    if (tableJoin.type !== 'csv')
      throw new UnsupportedOperationError(
        tableJoin,
        'spatialJoin',
        'Only CSV tables with geometryColumns params passed are supported for now on spatialJoin method as joinTableName',
      );

    const hasGeometryColumn = tableHasColumn(tableJoin, DEFAULT_GEO_COLUMN_NAME);
    if (!hasGeometryColumn)
      throw new ColumnNotFoundError(tableJoin, DEFAULT_GEO_COLUMN_NAME, 'You should pass geometryColumns on loadCsv.');

    if (params.spatialPredicate === 'NEAR' && !params.nearDistance)
      throw new UnsupportedOperationError(tableJoin, 'spatialJoin', 'You should pass nearDistance on NEAR joinType');

    return { tableRoot: table, tableJoin };
  }
}
