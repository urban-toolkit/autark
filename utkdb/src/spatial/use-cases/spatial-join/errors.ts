export class TableNotFoundError extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} not found`);
    this.name = 'TableNotFoundError';
  }
}

export class GeometryColumnNotFoundError extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} does not have a geometry column`);
    this.name = 'GeometryColumnNotFoundError';
  }
}
