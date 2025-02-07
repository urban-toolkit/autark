import { Filter } from '../../shared/interfaces';

export class FilterUseCase {
  exec(filters: Array<Filter>): string {
    if (filters.length === 0) return '';
    const filterString = filters
      .map((filter) => {
        return `${filter.table}.${filter.column} = '${filter.value}'`;
      })
      .join(' AND ');

    return `WHERE ${filterString} `;
  }
}
