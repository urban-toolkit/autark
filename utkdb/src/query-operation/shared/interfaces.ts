import { Table } from '../../shared/interfaces';

export interface Filter {
  table: Table;
  column: string;
  value: string;
}

export interface Select {
  table: Table;
  columns: Array<string>;
}

export interface Join {
  tableRoot: Table;
  tableJoin: Table;
  columnRoot: string;
  columnJoin: string;
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
}

export interface QueryParams {
  table: Table;
  filters: Array<Filter>;
  selects: Array<Select>;
  joins: Array<Join>;
}

export interface FilterParams {
  tableName?: string;
  column: string;
  value: string;
}

export interface SelectParams {
  tableName?: string;
  columns: Array<string>;
}

export interface JoinParams {
  tableRootName: string;
  tableJoinName: string;
  columnRoot: string;
  columnJoin: string;
}

export interface LayerSpatialJoin {
  layerTableName: string;
  joinTableName: string;
  // TODO: end just after fix csv load
}
