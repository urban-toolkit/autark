import { Join } from '../../shared/interfaces';

export class JoinUseCase {
  exec(joins: Array<Join>): string {
    if (joins.length === 0) return '';
    const joinString = joins
      .map((join) => {
        const joinType = join.joinType ? `${join.joinType} JOIN` : 'JOIN';
        return `${joinType} ${join.tableJoin.name} ON ${join.tableRoot.name}.${join.columnRoot} = ${join.tableJoin.name}.${join.columnJoin}`;
      })
      .join(' ');
    return joinString;
  }
}
