type Params = {
  tableName: string;
  coordinateFormat?: string;
};

export const GET_BOUNDING_BOX_QUERY = ({ tableName, coordinateFormat = 'EPSG:4326' }: Params) => `
  WITH node_bounds AS (
    SELECT 
      MIN(lon) as min_lon,
      MIN(lat) as min_lat,
      MAX(lon) as max_lon,
      MAX(lat) as max_lat
    FROM ${tableName}
    WHERE kind = 'node'
  ),
  transformed_bounds AS (
    SELECT
      ST_Transform(ST_Point(min_lon, min_lat), 'EPSG:4326', '${coordinateFormat}') as min_point,
      ST_Transform(ST_Point(max_lon, max_lat), 'EPSG:4326', '${coordinateFormat}') as max_point
    FROM node_bounds
  )
  SELECT 
    CAST(ST_X(min_point) AS DOUBLE) as minLon,
    CAST(ST_Y(min_point) AS DOUBLE) as minLat,
    CAST(ST_X(max_point) AS DOUBLE) as maxLon,
    CAST(ST_Y(max_point) AS DOUBLE) as maxLat
  FROM transformed_bounds;
`;

export const GET_SIMPLE_BOUNDING_BOX_QUERY = (tableName: string) => `
  SELECT 
    CAST(MIN(lon) AS DOUBLE) as minLon,
    CAST(MIN(lat) AS DOUBLE) as minLat,
    CAST(MAX(lon) AS DOUBLE) as maxLon,
    CAST(MAX(lat) AS DOUBLE) as maxLat
  FROM ${tableName}
  WHERE kind = 'node';
`;
