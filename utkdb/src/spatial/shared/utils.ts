import { Column, BoundingBox } from '../../shared/interfaces';

type DuckDbTableDescriptionColumn = {
  column_name: string;
  column_type: string;
};

export function getColumnsFromDuckDbTableDescribe(
  tableDescribeResponse: Array<DuckDbTableDescriptionColumn>,
): Array<Column> {
  return tableDescribeResponse.map((column: DuckDbTableDescriptionColumn) => {
    return {
      name: column.column_name,
      type: column.column_type,
    };
  });
}

export function getBoundingBoxFromPolygon(polygonCoordinates: number[][]): BoundingBox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  // Iterate through all coordinates in the polygon
  polygonCoordinates.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  });

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
  };
}

export function boundingBoxToPolygon(boundingBox: BoundingBox): number[][] {
  const { minLon, minLat, maxLon, maxLat } = boundingBox;

  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat], // Close the polygon
  ];
}
