import { Select } from '../../shared/interfaces';

export class SelectUseCase {
  exec(selects: Array<Select>): string {
    if (selects.length === 0) return `SELECT *`;
    const selectString = selects
      .map((select) => {
        return select.columns.map((column) => `${select.table.name}.${column}`).join(', ');
      })
      .join(', ');

    return `SELECT ${selectString} `;
  }
}
