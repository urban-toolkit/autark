import { Params } from './interfaces';

export const LOAD_PBF_ON_TABLE_QUERY = (pbfFileUrl: string, tableName: string, boudingBox?: Params['boudingBox']) => {
  if (!boudingBox)
    return `
        CREATE TABLE ${tableName} AS
            SELECT * FROM ST_READOSM('${pbfFileUrl}');

        DESCRIBE ${tableName};
  `;

  // TODO: remove it (deprecated, probably not working)
  const { minLat, minLon, maxLat, maxLon } = boudingBox;
  return `
        CREATE TABLE ${tableName} AS
            SELECT * 
            FROM ST_READOSM('${pbfFileUrl}')
            WHERE
            (
                kind = 'node' AND ST_Within(ST_Point(lon, lat), ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}))
            )
            OR
            (
                (kind = 'way' OR kind = 'rel')
            );

        DESCRIBE ${tableName};
      `;
};
