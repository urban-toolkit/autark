import { LayerTable } from '../../../shared/interfaces';

export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: LayerTable) => {
  const properties = layerTable.columns
    .filter((c) => c.name !== 'linestring' && c.name !== 'id' && c.name !== 'tags')
    .map((c) => `'${c.name}', ${c.name}`)
    .join(', ');

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (

    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(linestring AS JSON),
            'properties', json_merge_patch(
              to_json(tags), 
              json_object(
                ${properties}
              )
            )
          ) AS feature
    FROM ${layerTable.name}
    ) sub;
`;
};
