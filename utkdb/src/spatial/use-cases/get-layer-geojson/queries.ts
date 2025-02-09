export const GET_LAYER_AS_GEOJSON_QUERY = (layerTableName: string) => `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (

    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(linestring AS JSON),
            'properties', tags
            ) AS feature
    FROM ${layerTableName}
    ) sub;
`;
