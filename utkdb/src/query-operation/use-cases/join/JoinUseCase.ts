import { Join } from '../../shared/interfaces';

export class JoinUseCase {
  exec(joins: Array<Join>): string {
    if (joins.length === 0) return '';
    const joinString = joins
      .map((join) => {
        const joinType = join.joinType ? `${join.joinType} JOIN` : 'JOIN';
        return `${joinType} ${join.tableJoin} ON ${join.tableRoot}.${join.columnRoot} = ${join.tableJoin}.${join.columnJoin}`;
      })
      .join(' ');
    return joinString;
  }
}
