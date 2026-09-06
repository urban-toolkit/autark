import type { BoundingBox2D } from './types';

const DEFAULT_BBOX: BoundingBox2D = {
  minLon: -74.02,
  minLat: 40.70,
  maxLon: -73.97,
  maxLat: 40.76,
};

export interface WktFeatureRecord {
  the_geom: string;
  ntacode: string;
  ntaname: string;
  boroname: string;
  shape_area: string;
  shape_length: string;
  pop2010?: string;
  [key: string]: unknown;
}

export function generateSyntheticWktJson(count: number = 50, bbox: BoundingBox2D = DEFAULT_BBOX): WktFeatureRecord[] {
  const records: WktFeatureRecord[] = [];
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cellW = (bbox.maxLon - bbox.minLon) / gridSize;
  const cellH = (bbox.maxLat - bbox.minLat) / gridSize;

  for (let i = 0; i < count; i++) {
    const gx = i % gridSize;
    const gy = Math.floor(i / gridSize);
    const lon = bbox.minLon + gx * cellW;
    const lat = bbox.minLat + gy * cellH;
    const w = cellW * 0.8;
    const h = cellH * 0.8;

    const wkt = `MULTIPOLYGON (((` +
      `${lon.toFixed(6)} ${lat.toFixed(6)}, ` +
      `${(lon + w).toFixed(6)} ${lat.toFixed(6)}, ` +
      `${(lon + w).toFixed(6)} ${(lat + h).toFixed(6)}, ` +
      `${lon.toFixed(6)} ${(lat + h).toFixed(6)}, ` +
      `${lon.toFixed(6)} ${lat.toFixed(6)})))`;

    records.push({
      the_geom: wkt,
      ntacode: `MN${String(i + 1).padStart(2, '0')}`,
      ntaname: `Synthetic Area ${i + 1}`,
      boroname: 'Manhattan',
      shape_area: String(Math.round(w * h * 1e8)),
      shape_length: String(Math.round((w + h) * 2 * 1e5)),
      pop2010: String(5000 + i * 150),
    });
  }

  return records;
}
