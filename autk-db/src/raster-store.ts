import type { RasterBandMetadata } from './interfaces';

export interface CompactRasterPayload {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  originX: number;
  originY: number;
  /** Lower-left source-CRS corner of the normalized, bottom-up band arrays. */
  sourceMinX: number;
  sourceMinY: number;
  resX: number;
  resY: number;
  sourceCrs: string;
  targetCrs: string;
  bands: RasterBandMetadata[];
  values: Record<string, Float32Array>;
}

const rasterStore = new Map<string, CompactRasterPayload>();

export function getRasterStoreKey(workspace: string, tableName: string): string {
  return `${workspace}.${tableName}`;
}

export function setRasterPayload(workspace: string, tableName: string, payload: CompactRasterPayload): void {
  rasterStore.set(getRasterStoreKey(workspace, tableName), payload);
}

export function getRasterPayload(workspace: string, tableName: string): CompactRasterPayload | undefined {
  return rasterStore.get(getRasterStoreKey(workspace, tableName));
}

export function deleteRasterPayload(workspace: string, tableName: string): void {
  rasterStore.delete(getRasterStoreKey(workspace, tableName));
}
