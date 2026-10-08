import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpCache } from '../src/http-cache';
import { checkTagSets, type OsmElement, type OsmTagSet } from '../src/use-cases/load-osm-overpass/interfaces';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({ loadDb: async () => {
  const { loadDb } = await import('../src/duckdb-node');
  const engine = await loadDb(); engines.push(engine); return engine;
} }));
import { AutkDb } from '../src/db';

let db: AutkDb;
let serial = 0;
const bbox: [number, number, number, number] = [0, 0, 10, 10];
const oddName = `Joe's "Pizza" \\ 1`;
function way(id: number, coordinates: number[][], tags: Record<string, string> = {}, closed = true): OsmElement {
  const nodes = coordinates.map((_, i) => id * 100 + i);
  const geometry = coordinates.map(([lon, lat]) => ({ lon, lat }));
  return { type: 'way', id, tags, nodes: closed ? [...nodes, nodes[0]] : nodes,
    geometry: closed ? [...geometry, geometry[0]] : geometry };
}
const inside = way(1, [[1, 1], [2, 1], [2, 2], [1, 2]], { amenity: 'school' });
const outside = way(2, [[20, 20], [21, 20], [21, 21], [20, 21]], { amenity: 'school' });
const relation: OsmElement = { type: 'relation', id: 1, tags: { type: 'multipolygon', amenity: 'school' },
  members: [1, 2].map(ref => ({ type: 'way', ref, role: 'outer' })) };
const fixture: OsmElement[] = [
  inside, outside, relation,
  { type: 'node', id: 100, lon: 1, lat: 1, tags: { amenity: 'school', name: oddName } }, // Also way/1's vertex, emitted earlier.
  { type: 'node', id: 200, lon: 20, lat: 20, tags: { amenity: 'school' } },
  way(3, [[-1, 3], [11, 3]], { highway: 'footway' }, false),
  way(4, [[3, 4], [4, 4], [4, 5], [3, 5]], { highway: 'residential' }),
  way(5, [[5, 4], [6, 4], [6, 5], [5, 5]], { highway: 'pedestrian', area: 'yes' }),
  way(6, [[7, 4], [8, 4], [8, 5], [7, 5]], { landuse: 'grass', area: 'no' }),
];

beforeAll(async () => { vi.stubGlobal('self', globalThis); db = new AutkDb(); await db.init(); }, 120_000);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => { for (const engine of engines) await engine.terminate(); vi.unstubAllGlobals(); });

async function load(tagSets: OsmTagSet[], elements = fixture, layers: Array<'roads' | 'surface'> = []) {
  const api = (db as any).loadOsmFromOverpassApiUseCase;
  const requests: string[] = [];
  vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => {
    requests.push(query);
    return new Response(JSON.stringify({ elements: query.includes('->.tagHits') ? elements : [] }));
  });
  vi.useFakeTimers();
  const run = db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers }, tagSets, forceRefresh: true });
  // Attach the rejection assertion before advancing timers, while still propagating the error below.
  void run.catch(() => {});
  await vi.runAllTimersAsync();
  const timings = await run;
  vi.useRealTimers();
  return { requests, timings };
}

const schools = (type: OsmTagSet['type']): OsmTagSet => ({ name: 'schools', type, tags: [{ key: 'amenity', value: 'school' }] });

describe('typed OSM tag sets', () => {
  it('loads one points layer, keeps explicit node tags and does not turn areas into centroids', async () => {
    await db.setWorkspace(`tag_points_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const { requests, timings } = await load([schools('points')]);
    expect(timings.layers.map(layer => [layer.layerName, layer.layerType, layer.tagSet, layer.featureCount]))
      .toEqual([['table_osm_schools_points', 'points', 'schools', 1]]);
    const query = requests.find(query => query.includes('->.tagHits'))!;
    expect(query).toContain('node["amenity"="school"](0,0,10,10);');
    expect(query).not.toMatch(/way\[|relation\[/);
    expect(query).toContain('out body');
    const exported = await db.getLayer('table_osm_schools_points', { osmElements: true });
    expect(exported.features).toMatchObject([{ id: 'node/100', properties: { name: oddName, osm_type: 'node', osm_id: 100 },
      geometry: { type: 'Point', coordinates: [1, 1] } }]);
    expect(db.getLayersMetadata().map(layer => layer.name)).toEqual(['table_osm_schools_points']);
    expect(db.getCurrentWorkspaceData().workspaceCropLayer).toBe('table_osm_surface');
    expect(db.getTablesMetadata().map(table => table.name)).not.toContain('table_osm');
    expect((await db.getLayer('table_osm_schools_points')).features[0].properties?.name).toBe(oddName);
  });

  it('clips complete multipolygons and removes tagged auxiliary members outside the surface', async () => {
    await db.setWorkspace(`tag_polygons_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const { requests } = await load([schools('polygons')]);
    const query = requests.find(query => query.includes('->.tagHits'))!;
    expect(query).not.toContain('node["amenity"');
    expect(query).toContain('relation["amenity"="school"]["type"="multipolygon"]');
    expect(query).toContain('way(r.tagAreas)');
    const exported = await db.getLayer('table_osm_schools_polygons', { osmElements: true });
    expect(exported.features.map(feature => feature.id)).toEqual(['relation/1', 'way/1']);
    for (const feature of exported.features) {
      expect(feature.geometry.type).toBe('Polygon');
      expect(feature.properties).not.toHaveProperty('__autk_layer');
    }
    expect(exported.features[0].geometry).toEqual(exported.features[1].geometry);
    expect(db.getLayersMetadata().map(layer => layer.type)).toEqual(['polygons']);
  });

  it('keeps only the requested geometry family and clips crossing lines without changing standard roads', async () => {
    await db.setWorkspace(`tag_lines_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const { requests, timings } = await load([
      { name: 'paths', type: 'polylines', tags: [{ key: 'highway' }, { key: 'landuse' }] },
      { name: 'plazas', type: 'polygons', tags: [{ key: 'highway' }] },
    ], fixture, ['roads']);
    expect(requests.filter(query => query.includes('->.tagHits'))).toHaveLength(1);
    const lines = await db.getLayer('table_osm_paths_polylines', { osmElements: true });
    expect(lines.features.map(feature => feature.id)).toEqual(['way/3', 'way/4', 'way/6']);
    expect(lines.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[0, 3], [10, 3]] });
    expect((await db.getLayer('table_osm_plazas_polygons', { osmElements: true })).features.map(feature => feature.id)).toEqual(['way/5']);
    expect((await db.getLayer('table_osm_roads', { osmElements: true })).features.map(feature => feature.id)).toEqual(['way/4']);
    expect(timings.layers.map(layer => layer.layerType)).toEqual(['roads', 'polylines', 'polygons']);
  });

  it('does not clip bbox-selected standard roads to the land surface', async () => {
    await db.setWorkspace(`bbox_roads_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const clipToSurface = vi.spyOn(db as any, 'clipLayerToLayer');
    const clipToBbox = vi.spyOn(db as any, 'clipLayerToBoundingBox');

    await load([], fixture, ['roads']);

    expect(clipToSurface).not.toHaveBeenCalled();
    expect(clipToBbox).toHaveBeenCalledWith('table_osm_roads', expect.objectContaining({
      minLon: 0, minLat: 0, maxLon: 10, maxLat: 10,
    }), expect.any(String));
  });

  it('uses the coastal surface even for tag-only loads and cleans layers emptied by a reload', async () => {
    await db.setWorkspace(`tag_coast_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    await load([schools('points')]);
    expect(db.getLayersMetadata()).toHaveLength(1);
    const api = (db as any).loadOsmFromOverpassApiUseCase;
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => new Response(JSON.stringify({ elements:
      query.includes('coastline') ? [way(99, [[0.5, -1], [0.5, 11]], { natural: 'coastline' }, false)] : fixture })));
    vi.useFakeTimers();
    const run = db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: [] }, tagSets: [schools('points')], forceRefresh: true });
    await vi.runAllTimersAsync();
    expect((await run).layers).toEqual([]);
    expect(db.getLayersMetadata()).toEqual([]);
    expect(db.getTablesMetadata().map(table => table.name)).toEqual(['table_osm_surface']);
    await expect(db.getLayer('table_osm_schools_points')).rejects.toThrow('not found');
  });

  it('removes boundary-only intersections instead of storing lines in a polygons layer', async () => {
    await db.setWorkspace(`tag_touch_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const touching = way(9, [[10, 1], [11, 1], [11, 2], [10, 2]], { amenity: 'school' });
    expect((await load([schools('polygons')], [touching])).timings.layers).toEqual([]);
    expect(db.getLayersMetadata()).toEqual([]);
  });

  it('clips polygons to the administrative surface, not just its bbox', async () => {
    await db.setWorkspace(`tag_named_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const api = (db as any).loadOsmFromOverpassApiUseCase;
    const crossing = way(10, [[3, 3], [8, 3], [8, 8], [3, 8]], { amenity: 'school' });
    const boundaries: OsmElement[] = [
      { type: 'relation', id: 90, tags: { boundary: 'place', name: 'District' }, members: [{ type: 'way', ref: 91, role: 'outer' }] },
      way(91, [[0, 0], [10, 0], [0, 10]]),
    ];
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => new Response(JSON.stringify({ elements:
      query.includes('->.tagHits') ? [crossing] : query.includes('->.boundaryWays1') ? boundaries : [] })));
    vi.useFakeTimers();
    const run = db.loadOsm({ queryArea: { geocodeArea: 'Region', areas: ['District'] },
      autoLoadLayers: { layers: [] }, tagSets: [schools('polygons')], forceRefresh: true });
    await vi.runAllTimersAsync(); await run;
    const exported = await db.getLayer('table_osm_schools_polygons', { osmElements: true });
    expect(exported.features).toHaveLength(1);
    expect(exported.features[0].geometry.type).toBe('Polygon');
    if (exported.features[0].geometry.type !== 'Polygon') throw new Error('Expected a polygon');
    expect(exported.features[0].geometry.coordinates[0].every(([x, y]) => x + y <= 10 + 1e-7)).toBe(true);
    expect((await db.getBoundingBoxFromLayer('table_osm_schools_polygons')).maxLon).toBe(7);
  });

  it('normalizes projected coordinates and restores tag layers/metadata when clipping fails on reload', async () => {
    await db.setWorkspace(`tag_rollback_${++serial}`);
    await load([schools('points')]);
    const before = await db.getLayer('table_osm_schools_points', { osmElements: true });
    const coordinates = (before.features[0].geometry as { coordinates: number[] }).coordinates;
    expect(coordinates[0]).toBeGreaterThan(100000);
    expect(coordinates.every(value => Math.abs(value / 0.01 - Math.round(value / 0.01)) < 1e-6)).toBe(true);
    const previousMetadata = structuredClone(db.getTablesMetadata().find(table => table.name === 'table_osm_schools_points'));
    const clip = vi.spyOn(db as any, 'clipLayerToLayer').mockRejectedValue(new Error('test clip failure'));
    await expect(load([schools('points')], [{ type: 'node', id: 999, lon: 2, lat: 2, tags: { amenity: 'school' } }]))
      .rejects.toThrow('test clip failure');
    clip.mockRestore();
    expect(await db.getLayer('table_osm_schools_points', { osmElements: true })).toEqual(before);
    expect(db.getTablesMetadata().find(table => table.name === 'table_osm_schools_points')).toEqual(previousMetadata);
    expect(db.getTablesMetadata().map(table => table.name)).not.toContain('table_osm');
  });

  it('warns/skips invalid or incomplete elements without losing valid polygons', async () => {
    await db.setWorkspace(`tag_invalid_geometry_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const incomplete = way(11, [[3, 1], [4, 1], [4, 2], [3, 2]], { amenity: 'school' });
    // A referenced node with no inline coordinate cannot be resolved.
    incomplete.geometry![2] = undefined as any;
    const bowtie = way(12, [[5, 1], [6, 2], [5, 2], [6, 1]], { amenity: 'school' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await load([schools('polygons')], [inside, incomplete, bowtie,
      { ...relation, id: 13, tags: { type: 'route', amenity: 'school' } }]);
    expect((await db.getLayer('table_osm_schools_polygons', { osmElements: true })).features.map(feature => feature.id)).toEqual(['way/1']);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping invalid OSM polygons element 11/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping invalid OSM polygons element 12/));
  });

  it('retains only the new geometry type when a set is reloaded with another type', async () => {
    await db.setWorkspace(`tag_change_type_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    await load([schools('points')]);
    await load([schools('polygons')]);
    expect(db.getLayersMetadata().map(table => table.name)).toEqual(['table_osm_schools_polygons']);
    await expect(db.getLayer('table_osm_schools_points')).rejects.toThrow('not found');
  });

  it('reads relations after many nodes with fixed JSON column types', async () => {
    await db.setWorkspace(`tag_sample_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const nodes: OsmElement[] = Array.from({ length: 21000 }, (_, i) => ({ type: 'node', id: 100000 + i,
      lon: 1, lat: 1, tags: { amenity: 'bench' } }));
    await load([schools('polygons')], [...nodes, relation, inside, outside]);
    expect((await db.getLayer('table_osm_schools_polygons', { osmElements: true })).features.map(feature => feature.id))
      .toEqual(['relation/1', 'way/1']);
  });

  it.each([
    { name: 'schools', tags: [{ key: 'amenity' }] },
    { ...schools('points'), type: 'buildings' },
    { ...schools('points'), name: 'Bad-Name' },
    { ...schools('points'), tags: [] },
    { ...schools('points'), tags: [{ key: 'bad key' }] },
    { ...schools('points'), tags: [{ key: 'name', value: 'bad\nvalue' }] },
    { ...schools('points'), tags: [{ key: 'name', value: 'x'.repeat(256) }] },
  ])('rejects malformed tag sets before network requests: %j', async set => {
    await db.setWorkspace(`tag_invalid_${++serial}`);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    await expect(db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: [] }, tagSets: [set] as OsmTagSet[] })).rejects.toThrow(/tag set/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects PBF and duplicate set names before network requests', async () => {
    await db.setWorkspace(`tag_pbf_${++serial}`);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    await expect(db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: [] }, tagSets: [schools('points')], pbfFileUrl: '/data.pbf' }))
      .rejects.toThrow('tagSets are not supported with pbfFileUrl');
    await expect(db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: [] }, tagSets: [schools('points'), schools('polygons')] }))
      .rejects.toThrow(/unique/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('matches quoted tag values exactly in SQL as well as in the Overpass query', async () => {
    await db.setWorkspace(`tag_quotes_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    const { requests } = await load([{ name: 'named', type: 'points', tags: [{ key: 'name', value: oddName }] }]);
    expect(requests.find(query => query.includes('->.tagHits'))).toContain('node["name"="Joe\'s \\"Pizza\\" \\\\ 1"]');
    expect((await db.getLayer('table_osm_named_points', { osmElements: true })).features.map(feature => feature.id)).toEqual(['node/100']);
  });

  it('bounds set/filter counts and canonicalizes duplicate filters without mutating the caller', () => {
    expect(() => checkTagSets(Array.from({ length: 9 }, (_, i) => ({ ...schools('points'), name: `s${i}` })))).toThrow('at most 8');
    expect(() => checkTagSets([{ ...schools('points'), tags: Array.from({ length: 65 }, () => ({ key: 'amenity' })) }])).toThrow('1 to 64');
    const filters = [{ key: 'shop' }, { key: 'amenity', value: 'school' }, { key: 'shop' }];
    expect(checkTagSets([{ ...schools('points'), tags: filters }])[0].tags).toEqual([{ key: 'amenity', value: 'school' }, { key: 'shop' }]);
    expect(filters).toHaveLength(3);
  });

  it('quotes exact values, scopes named areas and keys the cache by type, not set name/order', async () => {
    const api = (db as any).loadOsmFromOverpassApiUseCase;
    const sets: OsmTagSet[] = [{ name: 'named', type: 'points', tags: [{ key: 'name', value: oddName }, { key: 'amenity' }] }];
    const query = api.buildTagSetQuery({ geocodeArea: 'Illinois', areas: ['Golf'] }, sets);
    expect(query).toContain('relation["name"="Golf"]["boundary"](area.areaMain)->.rel1;');
    expect(query).toContain('.rel1 map_to_area->.area1');
    expect(query).toContain('node["name"="Joe\'s \\"Pizza\\" \\\\ 1"](area.area1);');
    expect(query).not.toContain('~');
    const cache = new Map<string, any>();
    vi.spyOn(HttpCache.prototype, 'get').mockImplementation(async key => cache.get(key) ?? null);
    vi.spyOn(HttpCache.prototype, 'set').mockImplementation(async (key, value) => { cache.set(key, value); });
    const requests: string[] = [];
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => {
      requests.push(query); return new Response(JSON.stringify({ elements: fixture }));
    });
    // Old full-data entries cannot satisfy a typed tag request.
    cache.set(api.getFullDataCacheKey({ bbox }), { elements: [] });
    vi.useFakeTimers();
    const first = api.fetchCombinedOsmData({ bbox }, [], undefined, false, sets);
    await vi.runAllTimersAsync(); await first;
    expect(requests.some(query => query.includes('->.tagHits'))).toBe(true);
    requests.length = 0;
    await api.fetchCombinedOsmData({ bbox }, [], undefined, false, [{ ...sets[0], name: 'renamed', tags: [...sets[0].tags].reverse() }]);
    expect(requests).toEqual([]);
    const polygons = api.fetchCombinedOsmData({ bbox }, [], undefined, false, [{ ...sets[0], type: 'polygons' }]);
    await vi.runAllTimersAsync(); await polygons;
    expect(requests.some(query => query.includes('->.tagHits'))).toBe(true);
  });
});
