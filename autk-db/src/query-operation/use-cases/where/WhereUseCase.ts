import { Where } from '../../shared/interfaces';

export class WhereUseCase {
  exec(wheres: Array<Where>): string {
    if (wheres.length === 0) return '';

    const whereString = wheres
      .map((where) => {
        return `${where.table.name}."${where.column}" = '${where.value}'`;
      })
      .join(' AND ');

    return `WHERE ${whereString} `;
  }
}
