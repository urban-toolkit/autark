import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';

export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: LayerTable | CustomLayerTable) => {
  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (

    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
            'properties', ${
              layerTable.type === 'buildings'
                ? propertiesJsonIncludingBuildingIdIfColumnExists(layerTable.name)
                : 'properties'
            }
          ) AS feature
    FROM ${layerTable.name}
    ) sub;
`;
};

/**
 * Returns a SQL CASE expression that merges building_id into the properties JSON
 * when the column exists in the given table. Falls back to original properties otherwise.
 */
const propertiesJsonIncludingBuildingIdIfColumnExists = (tableName: string): string => `
  CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('${tableName}') WHERE name = 'building_id') > 0
       THEN json_merge_patch(CAST(properties AS JSON), json_object('building_id', building_id))
       ELSE properties END
`;
