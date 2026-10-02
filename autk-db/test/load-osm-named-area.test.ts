import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The node build swaps this module for duckdb-node; the tests do the same.
vi.mock('../src/duckdb', async () => await import('../src/duckdb-node'));

import { AutkDb } from '../src/db';

type Point = { lat: number; lon: number };

/** A closed square way over [west, south] to [east, north], as Overpass answers `out geom`. */
function square(id: number, first: number, [w, s, e, n]: number[], tags?: Record<string, string>) {
  const corners: Array<[number, number, number]> = [
    [first, s, w], [first + 1, s, e], [first + 2, n, e], [first + 3, n, w], [first, s, w],
  ];
  return {
    type: 'way',
    id,
    nodes: corners.map(([node]) => node),
    geometry: corners.map(([, lat, lon]): Point => ({ lat, lon })),
    ...(tags ? { tags } : {}),
  };
}

/** An administrative boundary relation of one outer way, as the boundaries query answers it. */
function boundary(relationId: number, name: string, outer: ReturnType<typeof square>) {
  return [
    {
      type: 'relation',
      id: relationId,
      members: [{ type: 'way', ref: outer.id, role: 'outer' }],
      tags: { type: 'boundary', boundary: 'administrative', name },
    },
    outer,
  ];
}

const GOLF = boundary(9001, 'Golf', square(9002, 90, [-87.8, 42.05, -87.78, 42.06]));
const GLENVIEW = boundary(9101, 'Glenview', square(9102, 91, [-87.84, 42.06, -87.8, 42.09]));
const PARK = square(101, 1, [-87.795, 42.052, -87.79, 42.055], { leisure: 'park', name: 'Test park' });
const HOUSE = square(201, 11, [-87.7945, 42.0525, -87.7942, 42.0527], { building: 'house' });

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
    const elements = query.includes('->.boundaryWays1')
      ? [...GOLF, ...(query.includes('"Glenview"') ? GLENVIEW : [])]
      : query.includes('"leisure"')
        ? [PARK]
        : query.includes('way["building"]')
          ? [HOUSE]
          : [];
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

describe('loadOsm with named areas', () => {
  it('scopes every layer query to the area of the boundary relation found by name', async () => {
    const db = await freshDb();
    const timings = await db.loadOsm({
      queryArea: { geocodeArea: 'Illinois', areas: ['Golf'] },
      autoLoadLayers: { layers: ['parks', 'buildings', 'surface'] },
    });

    // The boundaries query, then parks, then four building tiles.
    expect(sent).toHaveLength(6);
    for (const query of sent.slice(1)) {
      expect(query).toContain('area["name"="Illinois"]->.areaMain;');
      expect(query).toContain('relation["name"="Golf"](area.areaMain)->.rel1;');
      expect(query).toContain('.rel1 map_to_area->.area1;');
      expect(query).toContain('(area.area1)');
      // An area statement filtered by .areaMain matches every area of that name.
      expect(query).not.toContain('area["name"="Golf"]');
    }

    const counts = Object.fromEntries(timings.layers.map((l) => [l.layerType, l.featureCount]));
    expect(counts).toMatchObject({ parks: 1, buildings: 1, surface: 1 });
  }, 120_000);

  it('binds one area per name', async () => {
    const db = await freshDb();
    await db.loadOsm({
      queryArea: { geocodeArea: 'Illinois', areas: ['Golf', 'Glenview'] },
      autoLoadLayers: { layers: ['parks'] },
    });

    const parks = sent.find((query) => query.includes('"leisure"'))!;
    expect(parks).toContain('relation["name"="Glenview"](area.areaMain)->.rel2;');
    expect(parks).toContain('.rel2 map_to_area->.area2;');
    expect(parks).toContain('(area.area2)');
    expect(parks).not.toContain('area["name"="Glenview"]');
  }, 120_000);
});
