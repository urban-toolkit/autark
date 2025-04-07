export interface GetBoundingBoxParams {
  tableName: string;
  coordinateFormat?: string;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
