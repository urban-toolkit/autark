import type { BoundingBox2D, CsvGeneratorOptions } from './types';
import { DeterministicRandom } from './prng';
import { generateThomasClusterPoints } from './spatialbench-distributions';

const DEFAULT_BBOX: BoundingBox2D = {
  minLon: -74.02,
  minLat: 40.70,
  maxLon: -73.97,
  maxLat: 40.76,
};

const CHICAGO_BBOX: BoundingBox2D = {
  minLon: -87.65,
  minLat: 41.84,
  maxLon: -87.61,
  maxLat: 41.90,
};

export function generateGenericPointsCsv(options: CsvGeneratorOptions = {}): string {
  const rows = options.rowCount ?? 500;
  const bbox = options.bbox ?? DEFAULT_BBOX;
  const clustered = generateThomasClusterPoints(rows, bbox, { seed: options.seed ?? 123 });
  const lines: string[] = ['id,the_geom,latitude,longitude,category,value,created_at'];

  for (let i = 0; i < rows; i++) {
    const [lon, lat] = clustered[i];
    const wkt = `POINT (${lon.toFixed(6)} ${lat.toFixed(6)})`;
    const cat = ['Type-A', 'Type-B', 'Type-C', 'Type-D'][i % 4];
    const val = (Math.sin(i * 0.1) * 50 + 50).toFixed(2);
    const date = `2024-01-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`;
    lines.push(`${i + 1},"${wkt}",${lat.toFixed(6)},${lon.toFixed(6)},${cat},${val},${date}`);
  }

  return lines.join('\n');
}

export function generateTaxiCsv(rowCount: number = 500, bbox: BoundingBox2D = DEFAULT_BBOX): string {
  const rng = new DeterministicRandom(456);
  const pickups = generateThomasClusterPoints(rowCount, bbox, { seed: 456 });
  const dropoffs = generateThomasClusterPoints(rowCount, bbox, { seed: 789 });
  const lines: string[] = [
    'pickup_longitude,pickup_latitude,dropoff_longitude,dropoff_latitude,fare_amount,passenger_count,pickup_datetime',
  ];

  for (let i = 0; i < rowCount; i++) {
    const [plon, plat] = pickups[i];
    const [dlon, dlat] = dropoffs[i];
    const fare = (5.0 + rng.nextLogNormal(12, 0.4)).toFixed(2);
    const pass = (i % 4) + 1;
    const date = `2024-01-${String((i % 28) + 1).padStart(2, '0')} 10:${String(i % 60).padStart(2, '0')}:00`;
    lines.push(`${plon.toFixed(6)},${plat.toFixed(6)},${dlon.toFixed(6)},${dlat.toFixed(6)},${fare},${pass},${date}`);
  }

  return lines.join('\n');
}

export function generateNoiseCsv(rowCount: number = 300, bbox: BoundingBox2D = DEFAULT_BBOX): string {
  const clustered = generateThomasClusterPoints(rowCount, bbox, { seed: 999 });
  const lines: string[] = [
    'key,created_date,date,complaint_type,location_type,incident_zip,latitude,longitude,the_geom',
  ];
  const complaints = ['Noise - Street/Sidewalk', 'Noise - Commercial', 'Noise - Residential', 'Noise - Vehicle'];

  for (let i = 0; i < rowCount; i++) {
    const [lon, lat] = clustered[i];
    const date = `2024-05-${String((i % 28) + 1).padStart(2, '0')} 22:${String(i % 60).padStart(2, '0')}:00`;
    const ctype = complaints[i % complaints.length];
    const zip = 10001 + (i % 20);
    const wkt = `POINT (${lon.toFixed(6)} ${lat.toFixed(6)})`;
    lines.push(`${i + 1},"${date}","${date}","${ctype}","Street",${zip},${lat.toFixed(6)},${lon.toFixed(6)},"${wkt}"`);
  }

  return lines.join('\n');
}

export function generatePermitCsv(rowCount: number = 250, bbox: BoundingBox2D = DEFAULT_BBOX): string {
  const clustered = generateThomasClusterPoints(rowCount, bbox, { seed: 333 });
  const lines: string[] = ['filing_date,job_type,job_status,latitude,longitude,the_geom'];
  const jobs = ['A1', 'A2', 'A3', 'DM', 'NB'];

  for (let i = 0; i < rowCount; i++) {
    const [lon, lat] = clustered[i];
    const date = `2024-03-${String((i % 28) + 1).padStart(2, '0')}`;
    const job = jobs[i % jobs.length];
    const wkt = `POINT (${lon.toFixed(6)} ${lat.toFixed(6)})`;
    lines.push(`"${date}","${job}","PERMITTED",${lat.toFixed(6)},${lon.toFixed(6)},"${wkt}"`);
  }

  return lines.join('\n');
}

export function generateNycNeighborhoodsCsv(rowCount: number = 50, bbox: BoundingBox2D = DEFAULT_BBOX): string {
  const lines: string[] = ['the_geom,ntacode,ntaname,boroname,shape_area,pop2010'];
  const grid = Math.max(1, Math.ceil(Math.sqrt(rowCount)));
  const cw = (bbox.maxLon - bbox.minLon) / grid;
  const ch = (bbox.maxLat - bbox.minLat) / grid;

  for (let i = 0; i < rowCount; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const lon = bbox.minLon + gx * cw;
    const lat = bbox.minLat + gy * ch;
    const wkt = `MULTIPOLYGON (((` +
      `${lon.toFixed(6)} ${lat.toFixed(6)}, ` +
      `${(lon + cw).toFixed(6)} ${lat.toFixed(6)}, ` +
      `${(lon + cw).toFixed(6)} ${(lat + ch).toFixed(6)}, ` +
      `${lon.toFixed(6)} ${(lat + ch).toFixed(6)}, ` +
      `${lon.toFixed(6)} ${lat.toFixed(6)})))`;
    const code = `MN${String(i + 1).padStart(2, '0')}`;
    const name = `Neighborhood ${i + 1}`;
    lines.push(`"${wkt}",${code},"${name}","Manhattan",${Math.round(cw * ch * 1e8)},${10000 + i * 200}`);
  }

  return lines.join('\n');
}

export function generateShadowsChicagoCsv(rowCount: number = 100, bbox: BoundingBox2D = CHICAGO_BBOX): string {
  const clustered = generateThomasClusterPoints(rowCount, bbox, { seed: 555 });
  const lines: string[] = ['key,latitude,longitude,jun,sep,dez'];

  for (let i = 0; i < rowCount; i++) {
    const [lon, lat] = clustered[i];
    const jun = Math.round(((i * 19) % 720));
    const sep = Math.round(((i * 23) % 540));
    const dez = Math.round(((i * 31) % 360));
    lines.push(`${i + 1},${lat.toFixed(6)},${lon.toFixed(6)},${jun},${sep},${dez}`);
  }

  return lines.join('\n');
}
