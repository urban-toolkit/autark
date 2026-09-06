import type { FeatureCollection, Feature, Polygon, LineString, Point } from 'geojson';
import type { BoundingBox2D, GeoJsonGeneratorOptions, BuildingGeneratorOptions } from './types';
import { DeterministicRandom } from './prng';
import { generateThomasClusterPoints } from './spatialbench-distributions';
import { generateSpiderwebFootprint, sampleSpiderwebBuildingHeight, type FootprintShape } from './spiderweb-polygons';

const DEFAULT_NYC_BBOX: BoundingBox2D = {
  minLon: -74.02,
  minLat: 40.70,
  maxLon: -73.97,
  maxLat: 40.76,
};

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function generateSyntheticPolygons(options: GeoJsonGeneratorOptions = {}): FeatureCollection<Polygon> {
  const count = options.count ?? 50;
  const bbox = options.bbox ?? DEFAULT_NYC_BBOX;
  const features: Feature<Polygon>[] = [];
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cellW = (bbox.maxLon - bbox.minLon) / gridSize;
  const cellH = (bbox.maxLat - bbox.minLat) / gridSize;

  for (let i = 0; i < count; i++) {
    const gx = i % gridSize;
    const gy = Math.floor(i / gridSize);
    const lon = bbox.minLon + gx * cellW;
    const lat = bbox.minLat + gy * cellH;
    const padding = 0.08;
    const w = cellW * (1 - padding * 2);
    const h = cellH * (1 - padding * 2);
    const customProps = typeof options.properties === 'function'
      ? options.properties(i)
      : options.properties ?? {};

    const ring = [
      [lon + cellW * padding, lat + cellH * padding],
      [lon + cellW * padding + w, lat + cellH * padding],
      [lon + cellW * padding + w, lat + cellH * padding + h],
      [lon + cellW * padding, lat + cellH * padding + h],
      [lon + cellW * padding, lat + cellH * padding],
    ];

    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
      properties: {
        id: i + 1,
        ntacode: `MN${String(i + 1).padStart(2, '0')}`,
        ntaname: `Synthetic Neighborhood ${i + 1}`,
        cdta2020: `MN${String(i + 1).padStart(2, '0')}`,
        cdtaname: `Community District ${i + 1}`,
        shape_area: Math.round(w * h * 1e8),
        shape_leng: Math.round((w + h) * 2 * 1e5),
        shape_length: Math.round((w + h) * 2 * 1e5),
        landuse: ['Residential', 'Commercial', 'Parks', 'Industrial'][i % 4],
        value: Math.sin(i * 0.5) * 50 + 50,
        ...customProps,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function generateSyntheticBuildings(options: BuildingGeneratorOptions = {}): FeatureCollection<Polygon> {
  const count = options.count ?? 200;
  const bbox = options.bbox ?? DEFAULT_NYC_BBOX;
  const rng = new DeterministicRandom(options.seed ?? 777);
  const shapes: FootprintShape[] = ['rectangle', 'l-shape', 'u-shape', 't-shape', 'setback'];
  const features: Feature<Polygon>[] = [];
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cellW = (bbox.maxLon - bbox.minLon) / gridSize;
  const cellH = (bbox.maxLat - bbox.minLat) / gridSize;

  for (let i = 0; i < count; i++) {
    const gx = i % gridSize;
    const gy = Math.floor(i / gridSize);
    const lon = bbox.minLon + gx * cellW + cellW * 0.15;
    const lat = bbox.minLat + gy * cellH + cellH * 0.15;
    const bw = cellW * 0.7;
    const bh = cellH * 0.7;
    const shape = shapes[i % shapes.length];
    const ring = generateSpiderwebFootprint(lon, lat, bw, bh, shape);
    const height = sampleSpiderwebBuildingHeight(rng, 24, 0.8);

    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
      properties: {
        id: i + 1,
        height,
        min_height: 0,
        levels: Math.max(1, Math.round(height / 3.5)),
        type: 'building',
        name: `Building ${i + 1}`,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function generateSyntheticLines(options: GeoJsonGeneratorOptions = {}): FeatureCollection<LineString> {
  const count = options.count ?? 80;
  const bbox = options.bbox ?? DEFAULT_NYC_BBOX;
  const features: Feature<LineString>[] = [];

  for (let i = 0; i < count; i++) {
    const isHorizontal = i % 2 === 0;
    const t = i / count;
    let coords: number[][];

    if (isHorizontal) {
      const lat = lerp(bbox.minLat, bbox.maxLat, t);
      coords = [
        [bbox.minLon, lat],
        [lerp(bbox.minLon, bbox.maxLon, 0.5), lat + (Math.sin(i) * 0.001)],
        [bbox.maxLon, lat],
      ];
    } else {
      const lon = lerp(bbox.minLon, bbox.maxLon, t);
      coords = [
        [lon, bbox.minLat],
        [lon + (Math.cos(i) * 0.001), lerp(bbox.minLat, bbox.maxLat, 0.5)],
        [lon, bbox.maxLat],
      ];
    }

    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
      properties: {
        id: i + 1,
        highway: ['primary', 'secondary', 'residential', 'tertiary'][i % 4],
        name: `Street ${i + 1}`,
        length: 500 + (i * 25) % 1000,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function generateSyntheticPoints(options: GeoJsonGeneratorOptions = {}): FeatureCollection<Point> {
  const count = options.count ?? 150;
  const bbox = options.bbox ?? DEFAULT_NYC_BBOX;
  const clusteredPoints = generateThomasClusterPoints(count, bbox, { seed: options.seed ?? 888 });
  const features: Feature<Point>[] = [];

  for (let i = 0; i < count; i++) {
    const [lon, lat] = clusteredPoints[i];
    features.push({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      properties: {
        id: i + 1,
        category: ['poi', 'sensor', 'station', 'event'][i % 4],
        intensity: Math.round(Math.random() * 100),
        weight: Math.round(Math.random() * 50 + 10),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
