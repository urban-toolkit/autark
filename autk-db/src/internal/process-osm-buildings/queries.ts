/** Selects original parts in deterministic order for the existing OSM clustering rule. */
export const SELECT_BUILDING_GEOMETRY_QUERY = (qualifiedTableName: string) => `
  SELECT id, CAST(properties AS JSON) AS properties_json, CAST(ST_AsGeoJSON(geometry) AS JSON) AS geometry_json, ST_IsValid(geometry) AS valid_geometry, ST_IsEmpty(geometry) AS empty_geometry
  FROM ${qualifiedTableName}
  ORDER BY id
`;

/** Tests orphan parts against original outline geometry, including holes, without repairing or unioning it. */
export const SELECT_ORPHAN_OUTLINE_OWNERS_QUERY = (
  qualifiedTableName: string,
  outlines: Array<{ id: string; relationId: string }>,
  orphanIds: string[],
) => `
  WITH outlines AS (
    SELECT value->>'id' id, value->>'relationId' relation_id
    FROM json_each('${JSON.stringify(outlines).replace(/'/g, "''")}'::JSON)
  ), orphans AS (
    SELECT json_extract_string(value, '$') id
    FROM json_each('${JSON.stringify(orphanIds).replace(/'/g, "''")}'::JSON)
  )
  SELECT DISTINCT CAST(p.id AS VARCHAR) id, o.relation_id
  FROM ${qualifiedTableName} p
  JOIN orphans a ON a.id = CAST(p.id AS VARCHAR)
  CROSS JOIN outlines o
  JOIN ${qualifiedTableName} boundary ON o.id = CAST(boundary.id AS VARCHAR)
  WHERE ST_Covers(boundary.geometry, p.geometry)
  ORDER BY p.id, o.relation_id
`;

/**
 * Replaces part rows with one collection per building, without a geometric union.
 * The mapping file contains IDs and relation attributes, never coordinates.
 * Coordinates are collected directly from the source table exactly once.
 */
export const COLLECT_BUILDING_PARTS_QUERY = (qualifiedTableName: string, mappingFile: string) => `
  CREATE OR REPLACE TABLE ${qualifiedTableName} AS
  WITH indexed_parts AS (
    SELECT p.id, p.geometry, COALESCE(CAST(p.properties AS JSON), '{}'::JSON) AS properties,
      m.building_id, m.building_properties,
      ROW_NUMBER() OVER (PARTITION BY m.building_id ORDER BY p.id) - 1 AS geometry_index,
      COUNT(*) OVER (PARTITION BY m.building_id) AS part_count
    FROM ${qualifiedTableName} p
    JOIN read_json('${mappingFile}', columns = {id: 'BIGINT', building_id: 'BIGINT', building_properties: 'JSON'}) m ON p.id = m.id
  ), common_attributes AS (
    SELECT building_id, e.key, first(e.value) AS value
    FROM indexed_parts, LATERAL json_each(properties) e
    WHERE e.key NOT IN ('parts', 'building_id', 'geometryIndex', 'id')
    GROUP BY building_id, e.key
    HAVING COUNT(*) = MAX(part_count) AND COUNT(DISTINCT e.value) = 1
  ), common_properties AS (
    SELECT building_id, json_group_object(key, value) AS properties
    FROM common_attributes GROUP BY building_id
  )
  SELECT
    p.building_id AS id,
    p.building_id,
    ST_GeomFromGeoJSON(json_object('type', 'GeometryCollection',
      'geometries', to_json(list(CAST(ST_AsGeoJSON(geometry) AS JSON) ORDER BY geometry_index)))) AS geometry,
    json_merge_patch(COALESCE(c.properties, '{}'::JSON), first(p.building_properties),
      json_object('building_id', p.building_id, 'parts',
        to_json(list(json_merge_patch(p.properties,
          json_object('id', p.id, 'geometryIndex', geometry_index)) ORDER BY geometry_index)))) AS properties
  FROM indexed_parts p
  LEFT JOIN common_properties c ON p.building_id = c.building_id
  GROUP BY p.building_id, c.properties;
`;
