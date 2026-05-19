/**
 * Generates SQL to compute the bounding box of a layer's geometry column.
 *
 * @param layerTableName - Name of the table containing the geometry column.
 * @param workspace - Workspace (schema) name where the table resides.
 * @returns A SQL string selecting min/max longitude and latitude as `minLon`, `minLat`, `maxLon`, `maxLat`.
 * @example
 * const sql = GET_BOUNDING_BOX_FROM_LAYER_QUERY('osm_roads', 'autk');
 */
export const GET_BOUNDING_BOX_FROM_LAYER_QUERY = (layerTableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${layerTableName}`;
  return `
    WITH geometry_bounds AS (
      SELECT 
        ST_XMin(geometry) as min_x,
        ST_YMin(geometry) as min_y,
        ST_XMax(geometry) as max_x,
        ST_YMax(geometry) as max_y
      FROM ${qualifiedTableName}
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
