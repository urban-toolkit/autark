import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Feature, LineString } from 'geojson';

// The node build swaps this module for duckdb-node; the tests do the same.
vi.mock('../src/duckdb', async () => await import('../src/duckdb-node'));

import { AutkDb } from '../src/db';

// A small box in Golf, Illinois: [west, south, east, north].
const BOX: [number, number, number, number] = [-87.8, 42.05, -87.78, 42.06];

type Point = { lat: number; lon: number };

/** A way as Overpass answers `out geom`: its node ids with their positions. */
function way(id: number, nodes: Array<[number, number, number]>, tags?: Record<string, string>) {
  return {
    type: 'way',
    id,
    nodes: nodes.map(([node]) => node),
    geometry: nodes.map(([, lat, lon]): Point => ({ lat, lon })),
    ...(tags ? { tags } : {}),
  };
}

/** A closed square way over [west, south] to [east, north], with node ids from `first`. */
function square(id: number, first: number, [w, s, e, n]: number[], tags?: Record<string, string>) {
  return way(id, [[first, s, w], [first + 1, s, e], [first + 2, n, e], [first + 3, n, w], [first, s, w]], tags);
}

// Two buildings that share a wall (nodes 12 and 13): one Autark building.
const HOUSE = square(201, 11, [-87.7945, 42.0525, -87.7942, 42.0527], { building: 'house', height: '10' });
const ANNEX = way(
  202,
  [[12, 42.0525, -87.7942], [15, 42.0525, -87.7939], [16, 42.0527, -87.7939], [13, 42.0527, -87.7942], [12, 42.0525, -87.7942]],
  { 'building:part': 'yes', height: '4' },
);
// A ring that crosses itself: an invalid polygon, apart from the others.
const BOWTIE = way(
  203,
  [[21, 42.054, -87.79], [22, 42.0542, -87.7897], [23, 42.054, -87.7897], [24, 42.0542, -87.79], [21, 42.054, -87.79]],
  { building: 'yes' },
);
// A building drawn as a multipolygon relation of two untagged outer ways.
const CIVIC_OUTER_A = square(302, 31, [-87.785, 42.056, -87.7847, 42.0562]);
const CIVIC_OUTER_B = square(303, 35, [-87.784, 42.056, -87.7837, 42.0562]);
const CIVIC = {
  type: 'relation',
  id: 301,
  members: [
    { type: 'way', ref: 302, role: 'outer' },
    { type: 'way', ref: 303, role: 'outer' },
  ],
  tags: { type: 'multipolygon', building: 'civic', name: 'Village hall' },
};

const PARK = square(101, 1, [-87.795, 42.052, -87.79, 42.055], { leisure: 'park', name: 'Test park' });
const WOODS_OUTER = square(402, 41, [-87.788, 42.057, -87.786, 42.058]);
const WOODS = {
  type: 'relation',
  id: 401,
  members: [{ type: 'way', ref: 402, role: 'outer' }],
  tags: { type: 'multipolygon', natural: 'wood' },
};

// A road that leaves the box to the east.
const ROAD = way(501, [[51, 42.0555, -87.799], [52, 42.0555, -87.77]], { highway: 'residential', name: 'Test street' });

const realFetch = globalThis.fetch;
let db: AutkDb;

beforeAll(async () => {
  // autk-db's HTTP cache reads `self`, which Node does not define; a Node
  // caller defines it before using autk-db, as these tests do.
  if (typeof (globalThis as { self?: unknown }).self === 'undefined') {
    (globalThis as { self?: unknown }).self = globalThis;
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/status')) {
      return new Response('Connected as: 1\n2 slots available now.\n', { status: 200 });
    }
    const query = decodeURIComponent(String(init?.body ?? '').replace(/^data=/, ''));
    const elements = query.includes('"leisure"')
      ? [PARK, WOODS, WOODS_OUTER]
      : query.includes('way["building"]')
        ? [HOUSE, ANNEX, BOWTIE, CIVIC, CIVIC_OUTER_A, CIVIC_OUTER_B]
        : query.includes('way["highway"')
          ? [ROAD]
          : [];
    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  db = new AutkDb();
  await db.init();
  await db.loadOsm({
    queryArea: { bbox: BOX },
    autoLoadLayers: { layers: ['buildings', 'parks', 'roads', 'surface'] },
  });
}, 180_000);

afterAll(() => {
  globalThis.fetch = realFetch;
});

const byId = (features: Feature[]) =>
  Object.fromEntries(features.map((f) => [`${f.properties?.osm_type}/${f.properties?.osm_id}`, f]));

describe('getLayer with osmElements', () => {
  it('exports each building way and relation as its own feature, with its building', async () => {
    const buildings = await db.getLayer('table_osm_buildings', { osmElements: true });
    const features = byId(buildings.features);

    expect(Object.keys(features).sort()).toEqual(['relation/301', 'way/201', 'way/202', 'way/203']);
    expect(features['way/201'].properties).toMatchObject({ building: 'house', height: '10' });
    expect(features['way/202'].properties).toMatchObject({ 'building:part': 'yes', height: '4' });
    expect(features['relation/301'].properties).toMatchObject({ building: 'civic', name: 'Village hall' });
    expect(features['relation/301'].geometry?.type).toBe('MultiPolygon');
    expect(features['way/201'].geometry?.type).toBe('Polygon');

    // The two that share a wall belong to one building; the others stand alone.
    const buildingOf = (key: string) => features[key].properties?.building_id;
    expect(buildingOf('way/201')).toBe(buildingOf('way/202'));
    expect(new Set(['way/201', 'way/203', 'relation/301'].map(buildingOf)).size).toBe(3);
    for (const feature of buildings.features) {
      expect(typeof feature.properties?.building_id).toBe('number');
      expect(feature.properties).not.toHaveProperty('parts');
      expect(feature.properties).not.toHaveProperty('__autk_layer');
    }
  });

  it('leaves the default export as it was: one feature per valid building', async () => {
    const buildings = await db.getLayer('table_osm_buildings');

    expect(buildings.features).toHaveLength(2);
    const sizes = buildings.features.map((f) => (f.properties?.parts as unknown[]).length).sort();
    expect(sizes).toEqual([1, 2]);
    for (const feature of buildings.features) {
      expect(feature.geometry?.type).toBe('GeometryCollection');
      expect(feature.properties).not.toHaveProperty('osm_id');
    }
  });

  it('names the way and the relation of the parks, and the road after the cut', async () => {
    const parks = byId((await db.getLayer('table_osm_parks', { osmElements: true })).features);
    expect(Object.keys(parks).sort()).toEqual(['relation/401', 'way/101']);
    expect(parks['way/101'].properties).toMatchObject({ leisure: 'park', name: 'Test park' });
    expect(parks['relation/401'].properties).toMatchObject({ natural: 'wood' });

    const roads = (await db.getLayer('table_osm_roads', { osmElements: true })).features;
    expect(roads).toHaveLength(1);
    expect(roads[0].properties).toMatchObject({ osm_type: 'way', osm_id: 501, highway: 'residential' });
    expect(roads[0].properties).not.toHaveProperty('building_id');
    // Layers come back in EPSG:3395; the road ends at the box's east edge, not at -87.77.
    const eastX = (6378137 * BOX[2] * Math.PI) / 180;
    const xs = (roads[0].geometry as LineString).coordinates.map(([x]) => x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(eastX + 0.01);
  });

  it('gives the surface no OSM id, since no element is behind it', async () => {
    const surface = (await db.getLayer('table_osm_surface', { osmElements: true })).features;
    expect(surface).toHaveLength(1);
    expect(surface[0].properties ?? {}).not.toHaveProperty('osm_id');
    expect(surface[0].properties ?? {}).not.toHaveProperty('osm_type');
  });
});
