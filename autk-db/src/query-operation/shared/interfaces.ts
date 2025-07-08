import { Table } from '../../shared/interfaces';

export interface Where {
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

export interface SpatialJoin {
  tableRoot: Table;
  tableJoin: Table;
  spatialPredicate?: 'INTERSECT' | 'NEAR';
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  nearDistance?: number;
}

export interface QueryParams {
  table: Table;
  wheres: Array<Where>;
  selects: Array<Select>;
  joins: Array<Join>;
  spatialJoins: Array<SpatialJoin>;
}

export interface WhereParams {
  tableName: string;
  column: string;
  value: string;
}

export interface SelectParams {
  tableName: string;
  columns: Array<string>;
}

export interface JoinParams {
  tableRootName: string;
  tableJoinName: string;
  columnRoot: string;
  columnJoin: string;
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
}

export interface SpatialJoinParams {
  tableRootName: string;
  tableJoinName: string;
  spatialPredicate?: 'INTERSECT' | 'NEAR';
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  nearDistance?: number;
}
