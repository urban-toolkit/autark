import { Table } from '../../shared/interfaces';

export class TableNotFoundError extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} not found`);
    this.name = 'TableNotFoundError';
  }
}

export class ColumnNotFoundError extends Error {
  constructor(table: Table, columnName: string, extraMessage?: string) {
    super(`Column ${columnName} not found on table ${table.name}. ${extraMessage ? extraMessage : ''}`);
    this.name = 'ColumnNotFoundError';
  }
}

export class UnsupportedOperationError extends Error {
  constructor(table: Table, operation: string, extraMessage?: string) {
    super(`Operation ${operation} not supported on table ${table.name}. ${extraMessage ? extraMessage : ''}`);
    this.name = 'UnsupportedOperationError';
  }
}

export class TableShouldBeMainTable extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} should be the main table (received from constructor)`);
    this.name = 'TableShouldBeMainTable';
  }
}
