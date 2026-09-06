import type { BoundingBox2D, OsmGeneratorOptions } from './types';
import { DeterministicRandom } from './prng';
import { generateSpiderwebFootprint, sampleSpiderwebBuildingHeight, type FootprintShape } from './spiderweb-polygons';

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OsmWay {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface OsmRelationMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
}

export interface OsmRelation {
  type: 'relation';
  id: number;
  members?: OsmRelationMember[];
  tags?: Record<string, string>;
}

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export interface OverpassApiResponse {
  version?: number;
  generator?: string;
  elements: OsmElement[];
}

const CITY_BBOXES: Record<string, BoundingBox2D> = {
  'New York': { minLon: -74.02, minLat: 40.70, maxLon: -73.97, maxLat: 40.76 },
  'Chicago': { minLon: -87.65, minLat: 41.84, maxLon: -87.61, maxLat: 41.90 },
  'Paris': { minLon: 2.32, minLat: 48.84, maxLon: 2.37, maxLat: 48.87 },
  'Rio de Janeiro': { minLon: -43.14, minLat: -22.92, maxLon: -43.08, maxLat: -22.87 },
};

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function generateSyntheticOsmResponse(options: OsmGeneratorOptions = {}): OverpassApiResponse {
  const geocodeArea = options.geocodeArea ?? 'New York';
  const areas = options.areas && options.areas.length > 0 ? options.areas : ['Battery Park City', 'Financial District'];
  const layers = options.layers ?? ['surface', 'parks', 'water', 'roads', 'buildings'];
  const countPerLayer = options.featureCountPerLayer ?? 30;
  const bbox = options.bbox ?? (CITY_BBOXES[geocodeArea] ?? CITY_BBOXES['New York']);

  const elements: OsmElement[] = [];
  let nextId = 100000;

  // 1. Generate Boundary Relations and Ways for each area
  areas.forEach((areaName, areaIdx) => {
    const relId = nextId++;
    const wayId = nextId++;
    const nodeIds: number[] = [];
    const geom: Array<{ lat: number; lon: number }> = [];

    const subBbox: BoundingBox2D = {
      minLon: lerp(bbox.minLon, bbox.maxLon, areaIdx / areas.length),
      minLat: bbox.minLat,
      maxLon: lerp(bbox.minLon, bbox.maxLon, (areaIdx + 1) / areas.length),
      maxLat: bbox.maxLat,
    };

    const ringCoords = [
      [subBbox.minLon, subBbox.minLat],
      [subBbox.maxLon, subBbox.minLat],
      [subBbox.maxLon, subBbox.maxLat],
      [subBbox.minLon, subBbox.maxLat],
      [subBbox.minLon, subBbox.minLat],
    ];

    ringCoords.forEach(([lon, lat]) => {
      const nid = nextId++;
      nodeIds.push(nid);
      geom.push({ lat, lon });
      elements.push({ type: 'node', id: nid, lat, lon });
    });

    elements.push({
      type: 'way',
      id: wayId,
      nodes: nodeIds,
      geometry: geom,
      tags: { boundary: 'administrative', name: areaName },
    });

    elements.push({
      type: 'relation',
      id: relId,
      members: [{ type: 'way', ref: wayId, role: 'outer' }],
      tags: { boundary: 'administrative', admin_level: '8', name: areaName },
    });
  });

  // 2. Generate Layer Elements
  if (layers.includes('buildings')) {
    generateOsmBuildings(elements, countPerLayer, bbox, () => nextId++);
  }
  if (layers.includes('roads')) {
    generateOsmRoads(elements, countPerLayer, bbox, () => nextId++);
  }
  if (layers.includes('parks')) {
    generateOsmParks(elements, Math.max(5, Math.floor(countPerLayer / 3)), bbox, () => nextId++);
  }
  if (layers.includes('water')) {
    generateOsmWater(elements, Math.max(3, Math.floor(countPerLayer / 5)), bbox, () => nextId++);
  }
  if (layers.includes('surface')) {
    generateOsmSurface(elements, Math.max(5, Math.floor(countPerLayer / 4)), bbox, () => nextId++);
  }

  return { version: 0.6, generator: 'autk-benchmark-generator', elements };
}

function generateOsmBuildings(
  elements: OsmElement[],
  count: number,
  bbox: BoundingBox2D,
  getId: () => number,
): void {
  const grid = Math.ceil(Math.sqrt(count));
  const cw = (bbox.maxLon - bbox.minLon) / grid;
  const ch = (bbox.maxLat - bbox.minLat) / grid;
  const rng = new DeterministicRandom(4321);
  const shapes: FootprintShape[] = ['rectangle', 'l-shape', 'u-shape', 't-shape', 'setback'];

  for (let i = 0; i < count; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const lon = bbox.minLon + gx * cw + cw * 0.15;
    const lat = bbox.minLat + gy * ch + ch * 0.15;
    const bw = cw * 0.7;
    const bh = ch * 0.7;
    const shape = shapes[i % shapes.length];
    const ring = generateSpiderwebFootprint(lon, lat, bw, bh, shape);
    const height = sampleSpiderwebBuildingHeight(rng, 25, 0.7);

    const geom = ring.map(([plon, plat]) => ({ lon: plon, lat: plat }));
    const nodes = geom.map(pt => {
      const nid = getId();
      elements.push({ type: 'node', id: nid, lat: pt.lat, lon: pt.lon });
      return nid;
    });

    elements.push({
      type: 'way',
      id: getId(),
      nodes,
      geometry: geom,
      tags: { building: 'yes', height: String(height), 'building:levels': String(Math.ceil(height / 3.5)) },
    });
  }
}

function generateOsmRoads(
  elements: OsmElement[],
  count: number,
  bbox: BoundingBox2D,
  getId: () => number,
): void {
  for (let i = 0; i < count; i++) {
    const isH = i % 2 === 0;
    const t = (i + 0.5) / count;
    const geom = isH
      ? [{ lon: bbox.minLon, lat: lerp(bbox.minLat, bbox.maxLat, t) }, { lon: bbox.maxLon, lat: lerp(bbox.minLat, bbox.maxLat, t) }]
      : [{ lon: lerp(bbox.minLon, bbox.maxLon, t), lat: bbox.minLat }, { lon: lerp(bbox.minLon, bbox.maxLon, t), lat: bbox.maxLat }];

    const nodes = geom.map(pt => {
      const nid = getId();
      elements.push({ type: 'node', id: nid, lat: pt.lat, lon: pt.lon });
      return nid;
    });

    elements.push({
      type: 'way',
      id: getId(),
      nodes,
      geometry: geom,
      tags: { highway: ['primary', 'secondary', 'residential'][i % 3], name: `Street ${i + 1}` },
    });
  }
}

function generateOsmParks(elements: OsmElement[], count: number, bbox: BoundingBox2D, getId: () => number): void {
  for (let i = 0; i < count; i++) {
    const lon = lerp(bbox.minLon, bbox.maxLon, 0.2 + (i * 0.15) % 0.6);
    const lat = lerp(bbox.minLat, bbox.maxLat, 0.2 + (i * 0.2) % 0.6);
    const sz = 0.003;
    const geom = [{ lon, lat }, { lon: lon + sz, lat }, { lon: lon + sz, lat: lat + sz }, { lon, lat: lat + sz }, { lon, lat }];
    const nodes = geom.map(pt => {
      const nid = getId();
      elements.push({ type: 'node', id: nid, lat: pt.lat, lon: pt.lon });
      return nid;
    });
    elements.push({
      type: 'way',
      id: getId(),
      nodes,
      geometry: geom,
      tags: { leisure: 'park', name: `Park ${i + 1}` },
    });
  }
}

function generateOsmWater(elements: OsmElement[], count: number, bbox: BoundingBox2D, getId: () => number): void {
  for (let i = 0; i < count; i++) {
    const lon = lerp(bbox.minLon, bbox.maxLon, 0.8 + (i * 0.05));
    const lat = lerp(bbox.minLat, bbox.maxLat, i * 0.3);
    const sz = 0.005;
    const geom = [{ lon, lat }, { lon: lon + sz, lat }, { lon: lon + sz, lat: lat + sz }, { lon, lat: lat + sz }, { lon, lat }];
    const nodes = geom.map(pt => {
      const nid = getId();
      elements.push({ type: 'node', id: nid, lat: pt.lat, lon: pt.lon });
      return nid;
    });
    elements.push({
      type: 'way',
      id: getId(),
      nodes,
      geometry: geom,
      tags: { natural: 'water', name: `Water Body ${i + 1}` },
    });
  }
}

function generateOsmSurface(elements: OsmElement[], count: number, bbox: BoundingBox2D, getId: () => number): void {
  for (let i = 0; i < count; i++) {
    const lon = lerp(bbox.minLon, bbox.maxLon, 0.1 + (i * 0.15) % 0.7);
    const lat = lerp(bbox.minLat, bbox.maxLat, 0.1 + (i * 0.18) % 0.7);
    const sz = 0.004;
    const geom = [{ lon, lat }, { lon: lon + sz, lat }, { lon: lon + sz, lat: lat + sz }, { lon, lat: lat + sz }, { lon, lat }];
    const nodes = geom.map(pt => {
      const nid = getId();
      elements.push({ type: 'node', id: nid, lat: pt.lat, lon: pt.lon });
      return nid;
    });
    elements.push({
      type: 'way',
      id: getId(),
      nodes,
      geometry: geom,
      tags: { landuse: 'residential', surface: 'paved' },
    });
  }
}
