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
            'properties', properties
          ) AS feature
    FROM ${layerTable.name}
    ) sub;
`;
};
