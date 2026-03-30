import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';

export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: LayerTable | CustomLayerTable, workspace: string) => {
  const hasBuildingIdColumn = !!layerTable.columns?.some((c) => c.name === 'building_id');
  const qualifiedTableName = `${workspace}.${layerTable.name}`;

  if (layerTable.type === 'buildings' && hasBuildingIdColumn) {
    // Aggregate building parts into one feature per building.
    // Geometry becomes a GeometryCollection of all part polygons (one per part).
    // Properties contain a 'parts' array with per-part OSM properties (heights, tags, etc.)
    // aligned by index with geometry.geometries, plus shared/join properties at the top level.
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

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (
    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
            'properties', properties
          ) AS feature
    FROM ${qualifiedTableName}
    ) sub;
`;
};
