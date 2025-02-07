export interface Filter {
  table: string;
  column: string;
  value: string;
}

export interface Select {
  table: string;
  columns: Array<string>;
}

export interface Join {
  tableRoot: string;
  tableJoin: string;
  columnRoot: string;
  columnJoin: string;
  joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
}

export interface QueryParams {
  table: string;
  filters: Array<Filter>;
  selects: Array<Select>;
  joins: Array<Join>;
}
