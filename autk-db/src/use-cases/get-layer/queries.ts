import { Table } from '../../interfaces';
import type { LayerType } from '@urban-toolkit/autk-core';
import { OSM_ELEMENT_METADATA_COLUMN } from '../../consts';

/**
 * Exports one GeoJSON feature per stored row, including multipart buildings.
 * Raster layers remain a single feature with raster metadata.
 */
export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: Table & { type: LayerType }, workspace: string) => {
  const qualifiedTableName = `${workspace}.${layerTable.name}`;
  const propertiesExpression = buildPropertiesExpression(layerTable);
  const idColumn = layerTable.columns?.find(c => c.name === 'geojson_id')
    ?? layerTable.columns?.find(c => c.name === 'id');
  const featureId = idColumn ? `'id', ${quoteIdentifier(idColumn.name)},` : '';

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

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', COALESCE(json_group_array(feature), '[]'::JSON)
       ) AS geojson
    FROM (
      SELECT json_object(
        'type', 'Feature',
        ${featureId}
        'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
        'properties', ${propertiesExpression}
      ) AS feature
      FROM ${qualifiedTableName}
    ) sub;
  `;
};

/** Exports preserved OSM source records against their current, normalized component geometries. */
export const GET_LAYER_OSM_ELEMENTS_QUERY = (table: Table & { type: LayerType }, workspace: string) => {
  const qualifiedTable = `${quoteIdentifier(workspace)}.${quoteIdentifier(table.name)}`;
  const buildings = table.type === 'buildings';
  const geometry = buildings
    ? `source_geometry->'geometries'->CAST(element.value->>'geometryIndex' AS INTEGER)`
    : 'source_geometry';
  return `WITH source_rows AS MATERIALIZED (
      SELECT CAST(ST_AsGeoJSON(geometry) AS JSON) source_geometry, ${OSM_ELEMENT_METADATA_COLUMN}${buildings ? ', building_id' : ''}
      FROM ${qualifiedTable}
    )
    SELECT json_object('type', 'FeatureCollection', 'features', COALESCE(json_group_array(feature), '[]'::JSON)) geojson
    FROM (
      SELECT json_object('type', 'Feature',
        'id', (element.value->>'osm_type') || '/' || (element.value->>'osm_id'),
        'geometry', ${geometry},
        'properties', json_merge_patch(element.value->'tags', json_object(
          'osm_type', element.value->>'osm_type', 'osm_id', element.value->'osm_id'
          ${buildings ? ", 'building_id', building_id" : ''}))) feature
      FROM source_rows, LATERAL json_each(${OSM_ELEMENT_METADATA_COLUMN}) element
      ORDER BY ${buildings ? 'building_id,' : ''} element.value->>'osm_type', CAST(element.value->>'osm_id' AS BIGINT)
    ) ordered_elements;`;
};

/** Uses stored feature attributes, or constructs attributes for column-based tables. */
function buildPropertiesExpression(layerTable: Table & { type: LayerType }): string {
  if (layerTable.columns.some(column => column.name === 'properties')) {
    return `COALESCE(CAST(properties AS JSON), '{}'::JSON)`;
  }
  const propertyColumns = layerTable.columns.filter(column => column.type !== 'GEOMETRY' && column.name !== 'geojson_id' && column.name !== OSM_ELEMENT_METADATA_COLUMN);
  if (propertyColumns.length === 0) return `'{}'::JSON`;
  return `json_object(${propertyColumns
    .map(column => `'${column.name.replace(/'/g, "''")}', ${quoteIdentifier(column.name)}`)
    .join(', ')})`;
}

/** Quotes a column identifier for DuckDB. */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
