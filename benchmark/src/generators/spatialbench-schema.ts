import type { FeatureCollection, Polygon } from 'geojson';
import type { BoundingBox2D } from './types';
import { DeterministicRandom } from './prng';
import { generateThomasClusterPoints } from './spatialbench-distributions';
import { generateSpiderwebFootprint, sampleSpiderwebBuildingHeight, type FootprintShape } from './spiderweb-polygons';

const DEFAULT_NYC_BBOX: BoundingBox2D = {
  minLon: -74.02,
  minLat: 40.70,
  maxLon: -73.97,
  maxLat: 40.76,
};

export interface SpatialBenchTripRecord {
  t_tripkey: number;
  t_custkey: number;
  t_driverkey: number;
  the_geom: string;
  pickup_longitude: number;
  pickup_latitude: number;
  dropoff_longitude: number;
  dropoff_latitude: number;
  t_fare: number;
  t_distance: number;
  t_pickuptime: string;
  t_dropofftime: string;
}

export function generateSpatialBenchTrips(
  count: number = 1000,
  bbox: BoundingBox2D = DEFAULT_NYC_BBOX,
  seed: number = 42,
): SpatialBenchTripRecord[] {
  const rng = new DeterministicRandom(seed);
  const pickups = generateThomasClusterPoints(count, bbox, { seed });
  const dropoffs = generateThomasClusterPoints(count, bbox, { seed: seed + 1 });
  const trips: SpatialBenchTripRecord[] = [];

  for (let i = 0; i < count; i++) {
    const p = pickups[i];
    const d = dropoffs[i];
    const fare = Math.round((5.0 + rng.nextLogNormal(12, 0.5)) * 100) / 100;
    const dist = Math.round((Math.hypot(d[0] - p[0], d[1] - p[1]) * 111.32) * 100) / 100;
    const hour = Math.floor(rng.nextRange(6, 23));
    const min = Math.floor(rng.nextRange(0, 59));
    const sec = Math.floor(rng.nextRange(0, 59));

    trips.push({
      t_tripkey: i + 1,
      t_custkey: (i % 200) + 1,
      t_driverkey: (i % 50) + 1,
      the_geom: `POINT (${p[0].toFixed(6)} ${p[1].toFixed(6)})`,
      pickup_longitude: p[0],
      pickup_latitude: p[1],
      dropoff_longitude: d[0],
      dropoff_latitude: d[1],
      t_fare: fare,
      t_distance: dist,
      t_pickuptime: `2024-05-15 ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      t_dropofftime: `2024-05-15 ${String(hour + 1).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
    });
  }

  return trips;
}

export function generateSpatialBenchBuildings(
  count: number = 300,
  bbox: BoundingBox2D = DEFAULT_NYC_BBOX,
  seed: number = 101,
): FeatureCollection<Polygon> {
  const rng = new DeterministicRandom(seed);
  const grid = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cw = (bbox.maxLon - bbox.minLon) / grid;
  const ch = (bbox.maxLat - bbox.minLat) / grid;
  const shapes: FootprintShape[] = ['rectangle', 'l-shape', 'u-shape', 't-shape', 'setback'];
  const types = ['Commercial', 'Residential', 'Retail', 'Office', 'Mixed'];

  const features = [];
  for (let i = 0; i < count; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const lon = bbox.minLon + gx * cw + cw * 0.15;
    const lat = bbox.minLat + gy * ch + ch * 0.15;
    const bw = cw * 0.7;
    const bh = ch * 0.7;
    const shape = shapes[i % shapes.length];
    const ring = generateSpiderwebFootprint(lon, lat, bw, bh, shape);
    const height = sampleSpiderwebBuildingHeight(rng);

    features.push({
      type: 'Feature' as const,
      id: i + 1,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
      properties: {
        b_buildingkey: i + 1,
        b_name: `Building ${i + 1}`,
        b_type: types[i % types.length],
        height,
        min_height: 0,
        levels: Math.max(1, Math.round(height / 3.5)),
        shape_area: Math.round(bw * bh * 1e8),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function generateSpatialBenchZones(
  count: number = 20,
  bbox: BoundingBox2D = DEFAULT_NYC_BBOX,
): FeatureCollection<Polygon> {
  const grid = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cw = (bbox.maxLon - bbox.minLon) / grid;
  const ch = (bbox.maxLat - bbox.minLat) / grid;
  const categories = ['Downtown', 'Midtown', 'Uptown', 'Waterfront', 'Industrial'];

  const features = [];
  for (let i = 0; i < count; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const lon = bbox.minLon + gx * cw;
    const lat = bbox.minLat + gy * ch;
    const ring = [
      [lon, lat],
      [lon + cw, lat],
      [lon + cw, lat + ch],
      [lon, lat + ch],
      [lon, lat],
    ];

    features.push({
      type: 'Feature' as const,
      id: i + 1,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
      properties: {
        z_zonekey: i + 1,
        z_name: `Zone ${i + 1}`,
        z_category: categories[i % categories.length],
        shape_area: Math.round(cw * ch * 1e8),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
