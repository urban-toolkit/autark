export interface Params {
  tableName: string;
  pbfFileUrl: string;
  boudingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}
