import { Table } from '../../interfaces';
import type { LayerType } from '@urban-toolkit/autk-core';
import { GetLayerOptions } from './interfaces';

/**
 * Builds a SQL query that exports a layer table as a GeoJSON FeatureCollection.
 *
 * @remarks Raster layers return a single feature with raster metadata. Building layers
 *   without `building_id` group geometries by row; those with it merge parts per building.
 *   With `osmElements`, an OSM layer exports one feature per way or relation instead.
 * @param layerTable - The layer table including its type and column definitions.
 * @param workspace - Workspace (schema) name containing the table.
 * @param options - Export options.
 * @returns A SQL string that returns a single `geojson` column with GeoJSON output.
 */
export const GET_LAYER_AS_GEOJSON_QUERY = (
  layerTable: Table & { type: LayerType },
  workspace: string,
  options: GetLayerOptions = {},
) => {
  const hasBuildingIdColumn = !!layerTable.columns?.some((c) => c.name === 'building_id');
  const qualifiedTableName = `${workspace}.${layerTable.name}`;
  const propertiesExpression = buildPropertiesExpression(layerTable);

  if (options.osmElements && isOsmElementTable(layerTable)) {
    const hasOsmTypeColumn = layerTable.columns.some((c) => c.name === 'osm_type');
    return buildOsmElementsQuery(qualifiedTableName, hasBuildingIdColumn, hasOsmTypeColumn);
  }

  if (layerTable.type === 'raster') {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_array(
             json_object(
               'type', 'Feature',
               'geometry', NULL,
               'properties', json_object(
                 'rasterResX', COUNT(DISTINCT ROUND(ST_X(geometry), 8))::INTEGER,
                 'rasterResY', COUNT(DISTINCT ROUND(ST_Y(geometry), 8))::INTEGER,
                 'raster', list(properties ORDER BY ST_Y(geometry) ASC, ST_X(geometry) ASC)
               )
             )
           )
         ) AS geojson
      FROM ${qualifiedTableName};
    `;
  }

  if (layerTable.type === 'buildings' && hasBuildingIdColumn) {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_group_array(feature)
         ) AS geojson
      FROM (
        SELECT json_object(
          'type', 'Feature',
          'geometry', json_object('type', 'GeometryCollection', 'geometries', geom_array),
          'properties', json_merge_patch(rep_props, json_object('building_id', building_id, 'parts', parts_array))
        ) AS feature
        FROM (
          SELECT
            building_id,
            json_group_array(CAST(ST_AsGeoJSON(geometry) AS JSON)) AS geom_array,
            any_value(COALESCE(CAST(properties AS JSON), '{}'::JSON)) AS rep_props,
            json_group_array(COALESCE(CAST(properties AS JSON), '{}'::JSON)) AS parts_array
          FROM ${qualifiedTableName}
          WHERE ST_IsValid(geometry)
          GROUP BY building_id
        ) agg
      ) sub;
    `;
  }

  if (layerTable.type === 'buildings') {
    return `
      SELECT json_object(
           'type', 'FeatureCollection',
           'features', json_group_array(feature)
         ) AS geojson
      FROM (
        SELECT json_object(
          'type', 'Feature',
          'geometry', json_object('type', 'GeometryCollection', 'geometries', json_array(CAST(ST_AsGeoJSON(geometry) AS JSON))),
          'properties', ${propertiesExpression}
        ) AS feature
        FROM ${qualifiedTableName}
      ) sub;
    `;
  }

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (
    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
            'properties', ${propertiesExpression}
          ) AS feature
    FROM ${qualifiedTableName}
    ) sub;
`;
};

/**
 * Builds a SQL query that exports an OSM layer table with one feature per row.
 *
 * @remarks Each row of a layer `loadOsm` built is one node, way or relation. A tag
 *   set's tables record it in an `osm_type` column. The thematic layers hold ways and
 *   relations: a relation's row is written with empty `refs`, and a way's row always
 *   has its node refs, so the element type follows from `refs`. The added keys win
 *   over a tag of the same name.
 * @param qualifiedTableName - Workspace-qualified layer table name.
 * @param hasBuildingIdColumn - Whether rows carry the `building_id` of their building.
 * @param hasOsmTypeColumn - Whether rows record their element type in `osm_type`.
 * @returns A SQL string that returns a single `geojson` column with GeoJSON output.
 */
function buildOsmElementsQuery(qualifiedTableName: string, hasBuildingIdColumn: boolean, hasOsmTypeColumn = false): string {
  const elements = hasOsmTypeColumn
    ? qualifiedTableName
    : `(SELECT *, CASE WHEN len(refs) = 0 THEN 'relation' ELSE 'way' END AS osm_type FROM ${qualifiedTableName})`;
  const identity = hasBuildingIdColumn
    ? `json_object('osm_type', osm_type, 'osm_id', id, 'building_id', building_id)`
    : `json_object('osm_type', osm_type, 'osm_id', id)`;
  const order = hasBuildingIdColumn ? 'building_id, osm_type, id' : 'osm_type, id';

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', to_json(list(feature ORDER BY ${order}))
       ) AS geojson
    FROM (
      SELECT
        ${hasBuildingIdColumn ? 'building_id,' : ''}
        id,
        osm_type,
        json_object(
          'type', 'Feature',
          'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
          'properties', json_merge_patch(COALESCE(CAST(properties AS JSON), '{}'::JSON), ${identity})
        ) AS feature
      FROM ${elements} elements
    ) sub;
  `;
}

/**
 * Checks whether a table holds OSM elements: a layer `loadOsm` built, whose rows keep
 * the element's `id`, its `refs` and its tags as `properties`.
 *
 * @param table - The table to inspect.
 * @returns `true` for an OSM layer table with `id`, `refs` and `properties` columns.
 */
function isOsmElementTable(table: Table): boolean {
  const names = new Set(table.columns.map((column) => column.name));
  return table.source === 'osm' && names.has('id') && names.has('refs') && names.has('properties');
}

/**
 * Builds a SQL expression that extracts table properties as JSON.
 *
 * @remarks Returns `COALESCE(CAST(properties AS JSON), '{}'::JSON)` when a dedicated
 *   `properties` column exists, otherwise constructs a `json_object` from non-geometry columns.
 * @param layerTable - The table with its column definitions.
 * @returns A SQL fragment that evaluates to a JSON object of property values.
 */
function buildPropertiesExpression(layerTable: Table & { type: LayerType }): string {
  if (hasPropertiesColumn(layerTable)) {
    return `COALESCE(CAST(properties AS JSON), '{}'::JSON)`;
  }

  const propertyColumns = layerTable.columns.filter((column) => column.type !== 'GEOMETRY');
  if (propertyColumns.length === 0) {
    return `'{}'::JSON`;
  }

  return `json_object(${propertyColumns
    .map((column) => `'${column.name.replace(/'/g, "''")}', ${quoteIdentifier(column.name)}`)
    .join(', ')})`;
}

/**
 * Checks whether a table has a dedicated `properties` column.
 *
 * @param table - The table to inspect.
 * @returns `true` if a column named `properties` exists in the table schema.
 */
function hasPropertiesColumn(table: Table): boolean {
  return table.columns.some((column) => column.name === 'properties');
}

/**
 * Escapes a SQL identifier by wrapping it in double quotes and doubling any internal quotes.
 *
 * @param identifier - The raw identifier string to escape.
 * @returns A safely quoted SQL identifier (e.g. `"my_column"`).
 */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
