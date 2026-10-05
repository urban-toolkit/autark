import { Table } from '../../interfaces';
import type { LayerType } from '@urban-toolkit/autk-core';

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

/** Uses stored feature attributes, or constructs attributes for column-based tables. */
function buildPropertiesExpression(layerTable: Table & { type: LayerType }): string {
  if (layerTable.columns.some(column => column.name === 'properties')) {
    return `COALESCE(CAST(properties AS JSON), '{}'::JSON)`;
  }
  const propertyColumns = layerTable.columns.filter(column => column.type !== 'GEOMETRY' && column.name !== 'geojson_id');
  if (propertyColumns.length === 0) return `'{}'::JSON`;
  return `json_object(${propertyColumns
    .map(column => `'${column.name.replace(/'/g, "''")}', ${quoteIdentifier(column.name)}`)
    .join(', ')})`;
}

/** Quotes a column identifier for DuckDB. */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
