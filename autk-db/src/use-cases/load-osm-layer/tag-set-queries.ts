import type { OsmTagFilter, OsmTagSet } from '../load-osm-overpass/interfaces';
import { OSM_ELEMENT_METADATA_COLUMN } from '../../consts';

/** Presence/exact-value filters combined by OR; values are SQL literals, never expressions. */
export function TAG_SET_MATCH(filters: OsmTagFilter[]): string {
  return `(${filters.map(({ key, value }) => {
    const tag = `map_extract(tags, '${key.replace(/'/g, "''")}')[1]`;
    return value === undefined ? `${tag} IS NOT NULL` : `${tag} = '${value.replace(/'/g, "''")}'`;
  }).join(' OR ')})`;
}

/** Extracts one requested family, with source provenance and complete ordered node references. */
export function TAG_SET_TABLE_QUERY(params: {
  inputTable: string;
  outputTable: string;
  tagSet: OsmTagSet;
  sourceCrs: string;
  targetCrs: string;
}): string {
  const { inputTable, outputTable, tagSet, sourceCrs, targetCrs } = params;
  const match = TAG_SET_MATCH(tagSet.tags);
  const transform = (geometry: string) => `ST_Transform(${geometry}, '${sourceCrs}', '${targetCrs}', always_xy := true)`;
  const kind = tagSet.type === 'points' ? 'node' : 'way';
  const metadata = `json_array(json_object('osm_type', '${kind}', 'osm_id', id, 'geometryIndex', 0,
    'tags', COALESCE(CAST(tags AS JSON), '{}'::JSON))) AS ${OSM_ELEMENT_METADATA_COLUMN}`;
  if (tagSet.type === 'points') {
    return `CREATE OR REPLACE TABLE ${outputTable} AS
      SELECT id, tags AS properties, []::BIGINT[] AS refs,
        ${transform('ST_Point(lon, lat)')} AS geometry, ${metadata}
      FROM ${inputTable} WHERE kind = 'node' AND ${match} AND isfinite(lon) AND isfinite(lat);`;
  }

  // This is the PR's intentionally limited area policy, not a universal OSM classifier.
  const linear = `(COALESCE(map_extract(tags, 'area')[1] = 'no', false) OR
    ((map_contains(tags, 'highway') OR map_contains(tags, 'barrier') OR map_contains(tags, 'railway')
      OR map_contains(tags, 'waterway')) AND COALESCE(map_extract(tags, 'area')[1], '') <> 'yes'))`;
  const closed = '(len(refs) > 3 AND refs[1] = refs[len(refs)])';
  const family = tagSet.type === 'polygons' ? `${closed} AND NOT ${linear}` : `(NOT ${closed} OR ${linear})`;
  const line = 'ST_MakeLine(list(n.geometry ORDER BY r.ref_idx))';
  const geometry = tagSet.type === 'polygons' ? `ST_MakePolygon(${line})` : line;
  return `CREATE OR REPLACE TABLE ${outputTable} AS
    WITH ways AS (
      SELECT id, tags, refs FROM ${inputTable}
      WHERE kind = 'way' AND len(refs) > 1 AND ${match} AND ${family}
    ), way_refs AS (
      SELECT id, UNNEST(refs) AS ref, UNNEST(range(len(refs))) AS ref_idx FROM ways
    ), nodes AS (
      SELECT id, ST_Point(lon, lat) AS geometry FROM ${inputTable}
      WHERE kind = 'node' AND isfinite(lon) AND isfinite(lat)
    )
    SELECT w.id, w.tags AS properties, w.refs,
      CASE WHEN COUNT(n.id) = len(w.refs) THEN ${transform(geometry)} ELSE NULL END AS geometry,
      json_array(json_object('osm_type', 'way', 'osm_id', w.id, 'geometryIndex', 0,
        'tags', COALESCE(CAST(w.tags AS JSON), '{}'::JSON))) AS ${OSM_ELEMENT_METADATA_COLUMN}
    FROM ways w JOIN way_refs r ON w.id = r.id LEFT JOIN nodes n ON r.ref = n.id
    GROUP BY w.id, w.tags, w.refs;`;
}
