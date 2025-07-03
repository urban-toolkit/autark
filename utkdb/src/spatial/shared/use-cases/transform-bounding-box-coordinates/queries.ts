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
        ST_Transform(ST_Point(${boundingBox.minLon}, ${boundingBox.minLat}), 'EPSG:4326', '${coordinateFormat}', always_xy := true) as min_point,
        ST_Transform(ST_Point(${boundingBox.maxLon}, ${boundingBox.maxLat}), 'EPSG:4326', '${coordinateFormat}', always_xy := true) as max_point
    )
    SELECT 
      CAST(ST_X(min_point) AS DOUBLE) as minLon,
      CAST(ST_Y(min_point) AS DOUBLE) as minLat,
      CAST(ST_X(max_point) AS DOUBLE) as maxLon,
      CAST(ST_Y(max_point) AS DOUBLE) as maxLat
    FROM transformed_bounds;
  `;
};
