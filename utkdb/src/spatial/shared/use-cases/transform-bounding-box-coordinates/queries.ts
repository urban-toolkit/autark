type Params = {
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  coordinateFormat: string;
};

export const TRANSFORM_BOUNDING_BOX_COORDINATES_QUERY = ({ boundingBox, coordinateFormat }: Params) => {
  return `
    WITH transformed_bounds AS (
      SELECT
        ST_Transform(ST_Point(${boundingBox.minLat}, ${boundingBox.minLon}), 'EPSG:4326', '${coordinateFormat}') as min_point,
        ST_Transform(ST_Point(${boundingBox.maxLat}, ${boundingBox.maxLon}), 'EPSG:4326', '${coordinateFormat}') as max_point
    )
    SELECT 
      CAST(ST_X(min_point) AS DOUBLE) as minLat,
      CAST(ST_Y(min_point) AS DOUBLE) as minLon,
      CAST(ST_X(max_point) AS DOUBLE) as maxLat,
      CAST(ST_Y(max_point) AS DOUBLE) as maxLon
    FROM transformed_bounds;
  `;
};
