import { SpatialJoin } from '../../shared/interfaces';

export class SpatialJoinUseCase {
  exec(spatialJoins: Array<SpatialJoin>): string {
    if (spatialJoins.length === 0) return '';

    const joinString = spatialJoins
      .map((join) => {
        if (join.spatialPredicate === 'NEAR')
          return `${join.joinType || ''} JOIN ${join.tableJoin.name} ON ST_Distance( ST_GeomFromGeoJSON(${join.tableRoot.name}.linestring), ${join.tableJoin.name}.geoPoint) <= ${join.nearDistance}`;

        return `${join.joinType || ''} JOIN ${join.tableJoin.name} ON ST_Intersects( ST_GeomFromGeoJSON(${join.tableRoot.name}.linestring), ${join.tableJoin.name}.geoPoint)`;
      })
      .join(' ');
    return joinString;
  }
}
