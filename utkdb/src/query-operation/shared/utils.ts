import { Table } from '../../shared/interfaces';

export function tableHasColumn(table: Table, column: string): boolean {
  const columns = table.columns.map((column) => column.name);
  return columns.includes(column);
}
