import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The node build swaps this module for duckdb-node; the tests do the same.
vi.mock('../src/duckdb', async () => await import('../src/duckdb-node'));

import { AutkDb } from '../src/db';

// A small box in Golf, Illinois: [west, south, east, north].
const BOX: [number, number, number, number] = [-87.8, 42.05, -87.78, 42.06];

// One park inside the box, as Overpass answers `out geom`.
const PARK = {
  type: 'way',
  id: 101,
  nodes: [1, 2, 3, 4, 1],
  geometry: [
    { lat: 42.052, lon: -87.795 },
    { lat: 42.052, lon: -87.79 },
    { lat: 42.055, lon: -87.79 },
    { lat: 42.055, lon: -87.795 },
    { lat: 42.052, lon: -87.795 },
  ],
  tags: { leisure: 'park', name: 'Test park' },
};

// One building inside the box.
const BUILDING = {
  type: 'way',
  id: 201,
  nodes: [11, 12, 13, 14, 11],
  geometry: [
    { lat: 42.0525, lon: -87.7945 },
    { lat: 42.0525, lon: -87.7942 },
    { lat: 42.0527, lon: -87.7942 },
    { lat: 42.0527, lon: -87.7945 },
    { lat: 42.0525, lon: -87.7945 },
  ],
  tags: { building: 'house' },
};

/** The Overpass queries sent, decoded. */
let sent: string[] = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
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
    sent.push(query);
    const elements = query.includes('"leisure"') ? [PARK] : query.includes('way["building"]') ? [BUILDING] : [];
    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

afterEach(() => {
  sent = [];
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

async function freshDb(): Promise<AutkDb> {
  const db = new AutkDb();
  await db.init();
  return db;
}

describe('loadOsm with a bounding box', () => {
  it('sends no boundaries query, and constrains every layer query to the box', async () => {
    const db = await freshDb();
    await db.loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: ['parks', 'surface'] } });

    expect(sent).toHaveLength(1);
    const [query] = sent;
    expect(query).toContain('(42.05,-87.8,42.06,-87.78)');
    expect(query).not.toContain('area[');
    expect(query).not.toContain('area.area');
    expect(query).toContain('way["leisure"');
  }, 120_000);

  it('builds the layers, with the box as the surface', async () => {
    const db = await freshDb();
    const timings = await db.loadOsm({
      queryArea: { bbox: BOX },
      autoLoadLayers: { layers: ['parks', 'surface'] },
    });

    const counts = Object.fromEntries(timings.layers.map((l) => [l.layerType, l.featureCount]));
    expect(counts).toEqual({ parks: 1, surface: 1 });
    const parks = await db.getLayer('table_osm_parks');
    expect(parks.features[0].properties).toMatchObject({ leisure: 'park', name: 'Test park' });
    const surface = await db.getLayer('table_osm_surface');
    expect(surface.features).toHaveLength(1);
    expect(surface.features[0].geometry?.type).toMatch(/Polygon/);
  }, 120_000);

  it('tiles buildings over the box, four queries and no area lookup', async () => {
    const db = await freshDb();
    await db.loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: ['buildings'] } });

    expect(sent).toHaveLength(4);
    for (const query of sent) {
      expect(query).toContain('way["building"]');
      expect(query).not.toContain('area[');
    }
    // The four tiles cover the box: its corners are tile corners.
    expect(sent.some((q) => q.includes('(42.05,-87.8,'))).toBe(true);
    expect(sent.some((q) => q.includes(',42.06,-87.78)'))).toBe(true);
  }, 120_000);

  it('refuses a malformed box before any request', async () => {
    const db = await freshDb();
    for (const bbox of [[-87.78, 42.05, -87.8, 42.06], [-87.8, 42.06, -87.78, 42.05], [0, 0, 1]]) {
      await expect(
        db.loadOsm({ queryArea: { bbox: bbox as [number, number, number, number] }, autoLoadLayers: { layers: ['parks'] } }),
      ).rejects.toThrow('queryArea.bbox must be [west, south, east, north]');
    }
    expect(sent).toHaveLength(0);
  }, 120_000);

  it('a .pbf extract takes named areas only, and says so', async () => {
    const db = await freshDb();
    await expect(
      db.loadOsm({
        queryArea: { bbox: BOX },
        pbfFileUrl: 'http://localhost/none.osm.pbf',
        autoLoadLayers: { layers: ['parks'] },
      }),
    ).rejects.toThrow('a bbox is not supported with pbfFileUrl');
  }, 120_000);
});

describe('loadOsm with named areas', () => {
  it('still looks the areas up by name first', async () => {
    const db = await freshDb();
    await expect(
      db.loadOsm({
        queryArea: { geocodeArea: 'Illinois', areas: ['Golf'] },
        autoLoadLayers: { layers: ['parks'] },
      }),
    ).rejects.toThrow('No administrative boundary found in OSM for: "Golf"');
    expect(sent[0]).toContain('area["name"="Illinois"]->.areaMain;');
    expect(sent[0]).toContain('relation["name"="Golf"](area.areaMain)->.rel1;');
  }, 120_000);
});
