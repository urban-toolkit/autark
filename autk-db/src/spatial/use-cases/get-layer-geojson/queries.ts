import { CustomLayerTable, LayerTable } from '../../../shared/interfaces';

export const GET_LAYER_AS_GEOJSON_QUERY = (layerTable: LayerTable | CustomLayerTable, workspace: string) => {
  const hasBuildingIdColumn = !!layerTable.columns?.some((c) => c.name === 'building_id');
  const qualifiedTableName = `${workspace}.${layerTable.name}`;

  const propertiesExpr =
    layerTable.type === 'buildings' && hasBuildingIdColumn
      ? `json_merge_patch(COALESCE(CAST(properties AS JSON), '{}'::JSON), json_object('building_id', building_id))`
      : 'properties';

  return `
    SELECT json_object(
         'type', 'FeatureCollection',
         'features', json_group_array(feature)
       ) AS geojson
    FROM (

    SELECT json_object(
            'type', 'Feature',
            'geometry', CAST(ST_AsGeoJSON(geometry) AS JSON),
            'properties', ${propertiesExpr}
          ) AS feature
    FROM ${qualifiedTableName}
    ) sub;
`;
};
