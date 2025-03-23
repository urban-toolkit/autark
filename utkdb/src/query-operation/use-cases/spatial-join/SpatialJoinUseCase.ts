import { Table } from '../../../shared/interfaces';
import { SpatialJoin } from '../../shared/interfaces';

export class SpatialJoinUseCase {
  exec(spatialJoins: Array<SpatialJoin>): string {
    if (spatialJoins.length === 0) return '';

    const joinString = spatialJoins
      .map((join) => {
        if (join.spatialPredicate === 'NEAR')
          return `${join.joinType || ''} JOIN ${join.tableJoin.name} ON ST_Distance( ${join.tableRoot.name}."${this.getGeometryColumn(join.tableRoot)}", ${join.tableJoin.name}."${this.getGeometryColumn(join.tableJoin)}") <= ${join.nearDistance}`;

        return `${join.joinType || ''} JOIN ${join.tableJoin.name} ON ST_Intersects( ${join.tableRoot.name}."${this.getGeometryColumn(join.tableRoot)}", ${join.tableJoin.name}."${this.getGeometryColumn(join.tableJoin)}")`;
      })
      .join(' ');
    return joinString;
  }

  private getGeometryColumn(table: Table): string {
    const column = table.columns.find((column) => column.type === 'GEOMETRY');
    if (!column) throw new Error('Table does not have a geometry column');

    return column.name;
  }
}
