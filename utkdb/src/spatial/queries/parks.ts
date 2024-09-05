export const QUERY_PARKS_LINESTRINGS = (pbfFileUrl: string) => `
  CREATE TEMP TABLE parks AS
    SELECT id, tags FROM ST_READOSM('${pbfFileUrl}') 
      WHERE kind IN ('way', 'rel') AND
      (
        map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
        map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
        map_extract(tags, 'natural')[1] IN ('wood', 'grass')
      );

  CREATE TEMP TABLE parks_with_nodes_refs AS
    SELECT id, UNNEST(refs) as ref, UNNEST(range(length(refs))) as ref_idx
      FROM ST_READOSM('${pbfFileUrl}')
      SEMI JOIN parks USING (id)
        WHERE kind IN ('way', 'rel');

  CREATE TEMP TABLE required_nodes_with_geometries AS
    SELECT id, ST_POINT(lon, lat) geometry
      FROM ST_READOSM('${pbfFileUrl}') nodes
      SEMI JOIN parks_with_nodes_refs
      ON nodes.id = parks_with_nodes_refs.ref
      WHERE kind = 'node';

  CREATE TEMP TABLE parks_linestrings AS
    SELECT
        parks.id,
        parks.tags,
        ST_AsGeoJSON(ST_MakeLine(list(nodes.geometry ORDER BY ref_idx ASC))) linestring
    FROM parks
    JOIN parks_with_nodes_refs
    ON parks.id = parks_with_nodes_refs.id
    JOIN required_nodes_with_geometries nodes
    ON parks_with_nodes_refs.ref = nodes.id
    GROUP BY 1, 2;

  SELECT * FROM parks_linestrings;  
`;
