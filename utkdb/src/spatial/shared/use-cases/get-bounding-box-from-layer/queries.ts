export const GET_BOUNDING_BOX_FROM_LAYER_QUERY = (layerTableName: string) => {
  return `
    WITH geometry_bounds AS (
      SELECT 
        ST_XMin(geometry) as min_x,
        ST_YMin(geometry) as min_y,
        ST_XMax(geometry) as max_x,
        ST_YMax(geometry) as max_y
      FROM ${layerTableName}
      WHERE geometry IS NOT NULL
    )
    SELECT 
      CAST(MIN(min_x) AS DOUBLE) as minLon,
      CAST(MIN(min_y) AS DOUBLE) as minLat,
      CAST(MAX(max_x) AS DOUBLE) as maxLon,
      CAST(MAX(max_y) AS DOUBLE) as maxLat
    FROM geometry_bounds;
  `;
};
