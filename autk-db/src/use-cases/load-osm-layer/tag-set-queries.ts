import type { OsmTagFilter } from '../load-osm-overpass/interfaces';

/** A SQL string literal. */
function sqlString(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** The value of tag `key` in a raw OSM row's `tags` map, or NULL. */
function tagValue(key: string): string {
  return `map_extract(tags, ${sqlString(key)})[1]`;
}

/**
 * A SQL condition on a raw OSM row: its tags match any one of `filters`.
 *
 * @param filters - Keys that must be present, or key/value pairs that must match exactly.
 * @returns A parenthesized boolean SQL expression over the `tags` column.
 */
export function TAG_SET_MATCH(filters: OsmTagFilter[]): string {
  const conditions = filters.map((filter) =>
    filter.value === undefined
      ? `${tagValue(filter.key)} IS NOT NULL`
      : `${tagValue(filter.key)} = ${sqlString(filter.value)}`,
  );
  return `(${conditions.join(' OR ')})`;
}

/**
 * A closed way is an area unless it says otherwise: `area=no`, or a highway,
 * barrier, railway or waterway without `area=yes`. Those are lines.
 */
const LINEAR_WAY = `(
  COALESCE(${tagValue('area')} = 'no', false)
  OR (
    (${tagValue('highway')} IS NOT NULL OR ${tagValue('barrier')} IS NOT NULL
      OR ${tagValue('railway')} IS NOT NULL OR ${tagValue('waterway')} IS NOT NULL)
    AND COALESCE(${tagValue('area')}, '') <> 'yes'
  )
)`;

type TagSetTablesParams = {
  /** Workspace-qualified raw OSM table. */
  inputTable: string;
  /** Workspace-qualified output table names. */
  points: string;
  polylines: string;
  polygons: string;
  match: string;
  sourceCrs: string;
  targetCrs: string;
};

/**
 * Builds a tag set's three tables from the raw OSM table: matching nodes as
 * points; matching ways as polylines, or as polygons when closed and not
 * linear. Each row is one whole element with its `id`, `osm_type`, tags as
 * `properties`, `refs` and geometry. Multipolygon relations are added to the
 * polygons table afterwards.
 *
 * @returns A SQL script creating the three tables.
 */
export const TAG_SET_TABLES_QUERY = ({
  inputTable, points, polylines, polygons, match, sourceCrs, targetCrs,
}: TagSetTablesParams): string => {
  const transform = (geometry: string) =>
    `ST_Transform(${geometry}, '${sourceCrs}', '${targetCrs}', always_xy := true)`;
  const wayTable = (outputTable: string, geometry: string, where: string) => `
    CREATE OR REPLACE TABLE ${outputTable} AS
      SELECT w.id, 'way' AS osm_type, w.tags AS properties, w.refs,
             ${transform(geometry)} AS geometry
        FROM __autk_tag_ways w
        JOIN __autk_tag_way_refs r ON w.id = r.id
        JOIN __autk_tag_nodes n ON r.ref = n.id
        WHERE ${where}
        GROUP BY w.id, w.tags, w.refs;`;

  return `
    CREATE OR REPLACE TABLE ${points} AS
      SELECT id, 'node' AS osm_type, tags AS properties, []::BIGINT[] AS refs,
             ${transform('ST_POINT(lon, lat)')} AS geometry
        FROM ${inputTable}
        WHERE kind = 'node' AND tags IS NOT NULL AND ${match};

    CREATE OR REPLACE TEMP TABLE __autk_tag_ways AS
      SELECT id, tags, refs,
             (len(refs) > 3 AND refs[1] = refs[len(refs)]) AS closed,
             ${LINEAR_WAY} AS linear
        FROM ${inputTable}
        WHERE kind = 'way' AND len(refs) > 1 AND ${match};

    CREATE OR REPLACE TEMP TABLE __autk_tag_way_refs AS
      SELECT id, UNNEST(refs) AS ref, UNNEST(range(len(refs))) AS ref_idx
        FROM __autk_tag_ways;

    CREATE OR REPLACE TEMP TABLE __autk_tag_nodes AS
      SELECT id, ST_POINT(lon, lat) AS geometry
        FROM ${inputTable} nodes
        SEMI JOIN __autk_tag_way_refs refs ON nodes.id = refs.ref
        WHERE kind = 'node';
    ${wayTable(polylines, 'ST_MakeLine(list(n.geometry ORDER BY r.ref_idx ASC))', 'NOT w.closed OR w.linear')}
    ${wayTable(polygons, 'ST_MakePolygon(ST_MakeLine(list(n.geometry ORDER BY r.ref_idx ASC)))', 'w.closed AND NOT w.linear')}

    DROP TABLE __autk_tag_ways;
    DROP TABLE __autk_tag_way_refs;
    DROP TABLE __autk_tag_nodes;
  `;
};
