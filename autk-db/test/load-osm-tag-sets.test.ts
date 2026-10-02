import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Feature, LineString } from 'geojson';

// The node build swaps this module for duckdb-node; the tests do the same.
vi.mock('../src/duckdb', async () => await import('../src/duckdb-node'));

import { AutkDb } from '../src/db';
import type { OsmTagSet } from '../src';

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

function node(id: number, lat: number, lon: number, tags: Record<string, string>) {
  return { type: 'node', id, lat, lon, tags };
}

// A house from the buildings layer; its corner node 12 is also an ATM.
const HOUSE = square(201, 11, [-87.7945, 42.0525, -87.7942, 42.0527], { building: 'house' });
const ATM = node(12, 42.0525, -87.7942, { amenity: 'atm' });
const CAFE = node(1001, 42.053, -87.792, { amenity: 'cafe', name: 'Test cafe' });
const PARKING = square(2001, 21, [-87.791, 42.051, -87.79, 42.052], { amenity: 'parking' });
const ROUNDABOUT = square(2002, 25, [-87.789, 42.051, -87.788, 42.052], { highway: 'residential', junction: 'roundabout' });
const PLAZA = square(2003, 29, [-87.787, 42.051, -87.786, 42.052], { highway: 'pedestrian', area: 'yes' });
const HEDGE = square(2005, 33, [-87.785, 42.051, -87.784, 42.052], { barrier: 'hedge' });
const LAWN_EDGE = square(2006, 37, [-87.783, 42.051, -87.782, 42.052], { landuse: 'grass', area: 'no' });
// A footway that leaves the box to the east.
const FOOTWAY = way(2004, [[41, 42.0555, -87.79], [42, 42.0555, -87.77]], { highway: 'footway' });
const SCHOOL_OUTER = square(3002, 51, [-87.795, 42.057, -87.793, 42.058]);
const SCHOOL = {
  type: 'relation',
  id: 3001,
  members: [{ type: 'way', ref: 3002, role: 'outer' }],
  tags: { type: 'multipolygon', amenity: 'school' },
};
// A route relation that matches a tag: only multipolygons become features.
const ROUTE = {
  type: 'relation',
  id: 3003,
  members: [{ type: 'way', ref: 2004, role: '' }],
  tags: { type: 'route', amenity: 'school' },
};
const ODD_NAME = `Joe's "Pizza" \\ 1`;
const PIZZERIA = node(1101, 42.054, -87.791, { cuisine: 'pizza', name: ODD_NAME });

const TAGGED = [ATM, CAFE, PARKING, ROUNDABOUT, PLAZA, HEDGE, LAWN_EDGE, FOOTWAY, SCHOOL, SCHOOL_OUTER, ROUTE, PIZZERIA];
const GOLF_BOUNDARY = [
  {
    type: 'relation',
    id: 9001,
    members: [{ type: 'way', ref: 9002, role: 'outer' }],
    tags: { type: 'boundary', boundary: 'administrative', name: 'Golf' },
  },
  square(9002, 90, [-87.8, 42.05, -87.78, 42.06]),
];

const SETS: OsmTagSet[] = [
  { name: 'poi', tags: [{ key: 'amenity' }] },
  { name: 'paths', tags: [{ key: 'highway' }, { key: 'barrier' }] },
  { name: 'cafes', tags: [{ key: 'amenity', value: 'cafe' }] },
  { name: 'green', tags: [{ key: 'landuse', value: 'grass' }] },
];

/** The Overpass queries sent, decoded. */
let sent: string[] = [];
const realFetch = globalThis.fetch;
/** What a tag query is answered with, when a test sets it. */
let taggedAnswer: unknown[] | null = null;

function answer(query: string): unknown[] {
  if (query.includes('->.tagHits')) return taggedAnswer ?? TAGGED;
  if (query.includes('->.boundaryWays1')) return GOLF_BOUNDARY;
  if (query.includes('way["building"]')) return [HOUSE];
  if (query.includes('"leisure"')) return [square(101, 1, [-87.795, 42.052, -87.79, 42.055], { leisure: 'park' })];
  if (query.includes('way["highway"')) return [way(501, [[61, 42.0555, -87.799], [62, 42.0555, -87.781]], { highway: 'residential' })];
  return [];
}

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
    return new Response(JSON.stringify({ elements: answer(query) }), {
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

const keyOf = (f: Feature) => `${f.properties?.osm_type}/${f.properties?.osm_id}`;

describe('loadOsm with tag sets', () => {
  let db: AutkDb;
  let layers: Array<{ layerName: string; layerType: string; tagSet?: string; featureCount: number }>;
  let queries: string[];

  beforeAll(async () => {
    db = await freshDb();
    const timings = await db.loadOsm({
      queryArea: { bbox: BOX },
      autoLoadLayers: { layers: ['buildings'] },
      tagSets: SETS,
    });
    layers = timings.layers;
    queries = [...sent];
  }, 180_000);

  const elements = async (table: string) =>
    (await db.getLayer(table, { osmElements: true })).features.map(keyOf).sort();

  it('asks Overpass once for every set, with exact selectors and the box', () => {
    const tagQueries = queries.filter((q) => q.includes('->.tagHits'));
    expect(tagQueries).toHaveLength(1);
    const [query] = tagQueries;
    for (const selector of ['["amenity"]', '["amenity"="cafe"]', '["barrier"]', '["highway"]', '["landuse"="grass"]']) {
      for (const type of ['node', 'way', 'relation']) {
        expect(query).toContain(`${type}${selector}(42.05,-87.8,42.06,-87.78);`);
      }
    }
    expect(query).toContain('rel.tagHits["type"="multipolygon"]->.tagAreas;');
    expect(query).not.toContain('~');
  });

  it('splits each set by geometry and leaves out an empty one', async () => {
    const byLayer = Object.fromEntries(layers.map((l) => [l.layerName, [l.layerType, l.tagSet, l.featureCount]]));
    expect(byLayer).toMatchObject({
      table_osm_poi_points: ['points', 'poi', 2],
      table_osm_poi_polygons: ['polygons', 'poi', 2],
      table_osm_paths_polylines: ['polylines', 'paths', 3],
      table_osm_paths_polygons: ['polygons', 'paths', 1],
      table_osm_cafes_points: ['points', 'cafes', 1],
      table_osm_green_polylines: ['polylines', 'green', 1],
    });
    for (const absent of ['table_osm_poi_polylines', 'table_osm_paths_points', 'table_osm_cafes_polylines', 'table_osm_cafes_polygons']) {
      expect(byLayer).not.toHaveProperty(absent);
      await expect(db.getLayer(absent)).rejects.toThrow('not found');
    }

    expect(await elements('table_osm_poi_points')).toEqual(['node/1001', 'node/12']);
    expect(await elements('table_osm_poi_polygons')).toEqual(['relation/3001', 'way/2001']);
    expect(await elements('table_osm_paths_polylines')).toEqual(['way/2002', 'way/2004', 'way/2005']);
    expect(await elements('table_osm_paths_polygons')).toEqual(['way/2003']);
    expect(await elements('table_osm_cafes_points')).toEqual(['node/1001']);
    expect(await elements('table_osm_green_polylines')).toEqual(['way/2006']);
  });

  it('keeps the tags of a node that is also a way vertex', async () => {
    const points = (await db.getLayer('table_osm_poi_points', { osmElements: true })).features;
    const atm = points.find((f) => f.properties?.osm_id === 12)!;
    expect(atm.properties).toMatchObject({ amenity: 'atm', osm_type: 'node' });
    expect(atm.geometry?.type).toBe('Point');
    // The house it is a corner of still loads.
    expect((await db.getLayer('table_osm_buildings')).features).toHaveLength(1);
  });

  it('gives each feature its whole geometry and its tags', async () => {
    const polygons = (await db.getLayer('table_osm_poi_polygons', { osmElements: true })).features;
    const school = polygons.find((f) => f.properties?.osm_id === 3001)!;
    expect(school.properties).toMatchObject({ amenity: 'school', osm_type: 'relation' });
    expect(school.geometry?.type).toMatch(/Polygon/);
    for (const feature of polygons) expect(feature.properties).not.toHaveProperty('__autk_layer');

    // Layers come back in EPSG:3395; the footway is not cut at the box's east edge.
    const eastX = (6378137 * BOX[2] * Math.PI) / 180;
    const lines = (await db.getLayer('table_osm_paths_polylines', { osmElements: true })).features;
    const footway = lines.find((f) => f.properties?.osm_id === 2004)!;
    const xs = (footway.geometry as LineString).coordinates.map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(eastX + 100);
  });

  it('exports a tag-set layer without the option as any layer', async () => {
    const points = (await db.getLayer('table_osm_cafes_points')).features;
    expect(points).toHaveLength(1);
    expect(points[0].properties).toMatchObject({ amenity: 'cafe', name: 'Test cafe' });
  });
});

describe('a tag set', () => {
  it('quotes a value in the query and matches it exactly', async () => {
    const db = await freshDb();
    const timings = await db.loadOsm({
      queryArea: { bbox: BOX },
      autoLoadLayers: { layers: [] },
      tagSets: [{ name: 'named', tags: [{ key: 'name', value: ODD_NAME }] }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('node["name"="Joe\'s \\"Pizza\\" \\\\ 1"](42.05,-87.8,42.06,-87.78);');
    expect(timings.layers.map((l) => [l.layerName, l.featureCount])).toEqual([['table_osm_named_points', 1]]);
  }, 120_000);

  it('scopes a named area to its boundary relation', async () => {
    const db = await freshDb();
    await db.loadOsm({
      queryArea: { geocodeArea: 'Illinois', areas: ['Golf'] },
      autoLoadLayers: { layers: [] },
      tagSets: [{ name: 'poi', tags: [{ key: 'amenity' }] }],
    });
    const query = sent.find((q) => q.includes('->.tagHits'))!;
    expect(query).toContain('relation["name"="Golf"](area.areaMain)->.rel1;');
    expect(query).toContain('.rel1 map_to_area->.area1;');
    expect(query).toContain('node["amenity"](area.area1);');
    expect(query).not.toContain('area["name"="Golf"]');
  }, 120_000);

  it.each([
    ['a name that is not an identifier', [{ name: 'Bad-Name', tags: [{ key: 'amenity' }] }], 'tag set name'],
    ['a repeated name', [{ name: 'a', tags: [{ key: 'amenity' }] }, { name: 'a', tags: [{ key: 'shop' }] }], 'tag set name'],
    ['no tags', [{ name: 'a', tags: [] }], 'must have 1 to 64 tags'],
    ['a key with a space', [{ name: 'a', tags: [{ key: 'na me' }] }], 'not an OSM key'],
    ['a key with a quote', [{ name: 'a', tags: [{ key: 'a"b' }] }], 'not an OSM key'],
    ['a value with a newline', [{ name: 'a', tags: [{ key: 'name', value: 'a\nb' }] }], 'control character'],
    ['a value of 256 characters', [{ name: 'a', tags: [{ key: 'name', value: 'x'.repeat(256) }] }], 'too long'],
    ['nine sets', Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, tags: [{ key: 'amenity' }] })), 'at most 8'],
  ])('is refused before any request: %s', async (_label, tagSets, message) => {
    const db = await freshDb();
    await expect(
      db.loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: [] }, tagSets: tagSets as OsmTagSet[] }),
    ).rejects.toThrow(message);
    expect(sent).toHaveLength(0);
  }, 120_000);

  it('loads the relations of an answer that starts with many nodes', async () => {
    // More nodes than DuckDB samples to detect a JSON file's column types,
    // ahead of the relation and its outer way.
    const benches = Array.from({ length: 21000 }, (_, i) =>
      node(100000 + i, 42.051 + (i % 100) * 0.00008, -87.799 + Math.floor(i / 100) * 0.00008, { amenity: 'bench' }));
    taggedAnswer = [...benches, SCHOOL, SCHOOL_OUTER];
    try {
      const db = await freshDb();
      const timings = await db.loadOsm({
        queryArea: { bbox: BOX },
        autoLoadLayers: { layers: [] },
        tagSets: [{ name: 'poi', tags: [{ key: 'amenity' }] }],
      });
      const counts = Object.fromEntries(timings.layers.map((l) => [l.layerName, l.featureCount]));
      expect(counts).toEqual({ table_osm_poi_points: 21000, table_osm_poi_polygons: 1 });
      const polygons = (await db.getLayer('table_osm_poi_polygons', { osmElements: true })).features;
      expect(polygons.map(keyOf)).toEqual(['relation/3001']);
    } finally {
      taggedAnswer = null;
    }
  }, 180_000);

  it('is refused with a .pbf extract', async () => {
    const db = await freshDb();
    await expect(
      db.loadOsm({
        queryArea: { geocodeArea: 'Illinois', areas: ['Golf'] },
        pbfFileUrl: 'http://localhost/none.osm.pbf',
        autoLoadLayers: { layers: [] },
        tagSets: SETS,
      }),
    ).rejects.toThrow('tagSets are not supported with pbfFileUrl');
    expect(sent).toHaveLength(0);
  }, 120_000);
});

describe('a tag set loaded again on the same AutkDb', () => {
  const POI: OsmTagSet[] = [{ name: 'poi', tags: [{ key: 'amenity' }] }];

  /** Loads POI with the given tag answer and checks the load asked Overpass for it. */
  async function load(db: AutkDb, tagged: unknown[] | null) {
    taggedAnswer = tagged;
    sent = [];
    try {
      await db.loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: [] }, tagSets: POI });
    } finally {
      taggedAnswer = null;
    }
    expect(sent.filter((q) => q.includes('->.tagHits'))).toHaveLength(1);
  }

  const listed = (db: AutkDb) => db.getTablesMetadata().map((t) => t.name).filter((n) => n.startsWith('table_osm_poi_'));

  it('forgets every layer when the new answer has none', async () => {
    const db = await freshDb();
    await load(db, null);
    expect(listed(db).sort()).toEqual(['table_osm_poi_points', 'table_osm_poi_polygons']);

    await load(db, []);
    expect(listed(db)).toEqual([]);
    await expect(db.getLayer('table_osm_poi_points')).rejects.toThrow('not found');
    await expect(db.getLayer('table_osm_poi_polygons')).rejects.toThrow('not found');
  }, 180_000);

  it('keeps only the geometries of the new answer', async () => {
    const db = await freshDb();
    await load(db, [CAFE]);
    expect(listed(db)).toEqual(['table_osm_poi_points']);

    await load(db, [PARKING]);
    expect(listed(db)).toEqual(['table_osm_poi_polygons']);
    await expect(db.getLayer('table_osm_poi_points')).rejects.toThrow('not found');
    const polygons = (await db.getLayer('table_osm_poi_polygons', { osmElements: true })).features;
    expect(polygons.map(keyOf)).toEqual(['way/2001']);
  }, 180_000);
});

describe('the Overpass cache with tag sets', () => {
  const store = new Map<string, string>();

  beforeAll(() => {
    (globalThis as { caches?: unknown }).caches = {
      open: async () => ({
        match: async (request: Request) => (store.has(request.url) ? new Response(store.get(request.url)) : undefined),
        put: async (request: Request, response: Response) => void store.set(request.url, await response.text()),
        delete: async (request: Request) => store.delete(request.url),
      }),
    };
  });

  afterAll(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('does not answer a tag request from a cached load without tags, and keys it on the tags', async () => {
    await (await freshDb()).loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: [] } });
    expect(sent.some((q) => q.includes('->.tagHits'))).toBe(false);
    expect(store.size).toBe(1);

    sent = [];
    const sets: OsmTagSet[] = [{ name: 'poi', tags: [{ key: 'amenity' }, { key: 'shop' }] }];
    await (await freshDb()).loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: [] }, tagSets: sets });
    expect(sent.filter((q) => q.includes('->.tagHits'))).toHaveLength(1);

    // The same tags in another order, under another set name: the cached answer.
    sent = [];
    const reordered: OsmTagSet[] = [{ name: 'places', tags: [{ key: 'shop' }, { key: 'amenity' }] }];
    const timings = await (await freshDb()).loadOsm({ queryArea: { bbox: BOX }, autoLoadLayers: { layers: [] }, tagSets: reordered });
    expect(sent).toHaveLength(0);
    expect(timings.layers.some((l) => l.layerName === 'table_osm_places_points')).toBe(true);
  }, 240_000);
});
