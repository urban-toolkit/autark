export interface TransformBoundingBoxCoordinatesParams {
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  coordinateFormat: string;
}
