// TODO: pass bouding box

type BoudingBox = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export const LOAD_PBF_ON_TABLE = (pbfFileUrl: string, tableName: string, boudingBox?: BoudingBox) => {
  if (!boudingBox)
    return `
    CREATE TABLE ${tableName} AS
        SELECT * FROM ST_READOSM('${pbfFileUrl}');
`;

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
    `;
};
