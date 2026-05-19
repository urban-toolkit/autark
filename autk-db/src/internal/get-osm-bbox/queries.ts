/**
 * Generates a SQL query to retrieve the bounding box of an OSM table.
 *
 * @param osmTableName Name of the OSM boundaries table.
 * @param workspace The database workspace where the table resides.
 * @param coordinateFormat Optional target CRS for spatial transformation.
 * @returns A SQL string that selects the min/max longitude and latitude.
 * @example
 * const query = GET_OSM_BBOX_QUERY('osm_ways', 'autk');
 * console.log(query);
 */
export const GET_OSM_BBOX_QUERY = (
  osmTableName: string,
  workspace: string,
  coordinateFormat?: string,
) => {
  const qualifiedTableName = `${workspace}.${osmTableName}`;

  if (!coordinateFormat || coordinateFormat === 'EPSG:4326') {
    return `
      SELECT
        CAST(MIN(lon) AS DOUBLE) as minLon,
        CAST(MIN(lat) AS DOUBLE) as minLat,
        CAST(MAX(lon) AS DOUBLE) as maxLon,
        CAST(MAX(lat) AS DOUBLE) as maxLat
      FROM ${qualifiedTableName}
      WHERE lat IS NOT NULL AND lon IS NOT NULL;
    `;
  }

  return `
    WITH raw_bounds AS (
      SELECT
        ST_Point(MIN(lon), MIN(lat)) as min_point,
        ST_Point(MAX(lon), MAX(lat)) as max_point
      FROM ${qualifiedTableName}
      WHERE lat IS NOT NULL AND lon IS NOT NULL
    ),
    transformed_bounds AS (
      SELECT
        ST_Transform(min_point, 'EPSG:4326', '${coordinateFormat}', always_xy := true) as min_point,
        ST_Transform(max_point, 'EPSG:4326', '${coordinateFormat}', always_xy := true) as max_point
      FROM raw_bounds
    )
    SELECT
      CAST(ST_X(min_point) AS DOUBLE) as minLon,
      CAST(ST_Y(min_point) AS DOUBLE) as minLat,
      CAST(ST_X(max_point) AS DOUBLE) as maxLon,
      CAST(ST_Y(max_point) AS DOUBLE) as maxLat
    FROM transformed_bounds;
  `;
};
