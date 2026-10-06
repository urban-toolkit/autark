import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { readFile } from 'node:fs/promises';
import { booleanPointInPolygon, point } from '@turf/turf';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';
import { OsmProcessingPipeline } from '../src/internal/process-osm/pipeline';
import { HttpCache } from '../src/http-cache';
import { boundingBoxOf, type OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';
import { resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import { encodeBuildingPbf, syntheticElements } from './fixtures/building-pipeline';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

let client: AutkDb;
let conn: AsyncDuckDBConnection;
let pipeline: OsmProcessingPipeline;
let workspace = 0;
const bbox: [number, number, number, number] = [0, 0, 10, 10];
const extra: OsmElement[] = [
  { type: 'way', id: 801, nodes: [810, 811, 812], tags: { natural: 'coastline' } },
  ...[[5, -1], [5, 5], [5, 11]].map(([lon, lat], i) => ({ type: 'node' as const, id: 810 + i, lon, lat })),
  { type: 'way', id: 802, nodes: [820, 821], tags: { highway: 'residential' } },
  ...[[-1, 3], [9, 3]].map(([lon, lat], i) => ({ type: 'node' as const, id: 820 + i, lon, lat })),
  { type: 'way', id: 803, nodes: [830, 831, 832, 833, 830], tags: { natural: 'water', water: 'lake' } },
  ...[[1, 5], [2, 5], [2, 6], [1, 6]].map(([lon, lat], i) => ({ type: 'node' as const, id: 830 + i, lon, lat })),
  { type: 'relation', id: 600, tags: { type: 'building' }, members: [
    { type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 50, role: 'part' },
  ] },
];

beforeAll(async () => {
  native.db = await loadDb();
  conn = await native.db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
  pipeline = new OsmProcessingPipeline(native.db, conn);
  vi.stubGlobal('self', globalThis);
  client = new AutkDb();
  await client.init();
}, 120_000);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => {
  await (client as any)?.conn?.close();
  await conn?.close();
  await native.db?.terminate();
  vi.unstubAllGlobals();
});

async function provide(elements: OsmElement[], source: string): Promise<void> {
  if (source === 'pbf') {
    const bytes = await encodeBuildingPbf(elements);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
  } else {
    const inline = structuredClone(elements);
    resolveWayGeometries(inline);
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements: inline });
  }
}

describe('OSM surface is mandatory, coastal and shared by both sources', () => {
  it.each(['api', 'pbf'])('loads bbox with %s, filters whole buildings and retains an internal mask for later imports', async source => {
    await client.setWorkspace(`bbox_${++workspace}`);
    client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
    await provide([...structuredClone(syntheticElements), ...extra], source);
    const result = await client.loadOsm({ queryArea: { bbox }, ...(source === 'pbf' ? { pbfFileUrl: '/bbox.pbf' } : {}),
      autoLoadLayers: { layers: ['buildings', 'roads', 'water'] } });
    expect(result.layers.map(layer => layer.layerType)).toEqual(['buildings', 'roads', 'water']);
    expect(client.getLayersMetadata().map(layer => layer.type)).toEqual(['buildings', 'roads', 'water']);
    const surface = await client.getLayer('table_osm_surface');
    expect(surface.features).toHaveLength(1);
    expect(booleanPointInPolygon(point([2, 8]), surface.features[0] as any)).toBe(true);
    expect(booleanPointInPolygon(point([8, 8]), surface.features[0] as any)).toBe(false);
    const buildings = await client.getLayer('table_osm_buildings');
    const building = buildings.features.find(feature => feature.properties?.osmRelation?.id === '600')!;
    expect(building.properties?.parts.map((part: any) => [part.id, part.geometryIndex])).toEqual([[10, 0], [50, 1]]);
    expect(building.geometry).toMatchObject({ type: 'GeometryCollection', geometries: [expect.any(Object),
      { type: 'Polygon', coordinates: [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]] }] });
    expect(buildings.features.map(feature => feature.id)).not.toContain(30);
    expect(buildings.features.map(feature => feature.id)).not.toContain(40);
    const road = await client.getLayer('table_osm_roads');
    expect(road.features[0].geometry).toMatchObject({ type: 'LineString', coordinates: [[0, 3], [5, 3]] });
    expect((await client.getLayer('table_osm_water')).features).toHaveLength(1);
    await client.loadGeojson({ outputTableName: 'later', layerType: 'points', coordinateFormat: 'EPSG:4326',
      geojsonObject: { type: 'FeatureCollection', features: [2, 8].map(x => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, 8] }, properties: {} })) } });
    expect((await client.getLayer('later')).features).toHaveLength(1);
    expect(client.getTablesMetadata().some(table => ['table_osm', 'table_osm_boundaries'].includes(table.name))).toBe(false);
  });

  it.each(['api', 'pbf'])('intersects administrative geometry with coastline for %s and exposes requested surface', async source => {
    await client.setWorkspace(`named_coast_${++workspace}`);
    client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
    await provide([...structuredClone(syntheticElements), ...extra], source);
    await client.loadOsm({ queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      ...(source === 'pbf' ? { pbfFileUrl: '/named.pbf' } : {}), autoLoadLayers: { layers: ['surface', 'buildings'] } });
    expect(client.getLayersMetadata().map(layer => layer.type)).toEqual(['surface', 'buildings']);
    const surface = (await client.getLayer('table_osm_surface')).features[0];
    expect(booleanPointInPolygon([2, 2], surface as any)).toBe(true);
    expect(booleanPointInPolygon([8, 1], surface as any)).toBe(false); // sea within administrative triangle
    expect(booleanPointInPolygon([4, 8], surface as any)).toBe(false); // land outside administrative triangle
  });

  it.each(['api', 'pbf'])('warns and uses the full bbox for empty %s data', async source => {
    await client.setWorkspace(`empty_bbox_${++workspace}`);
    client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
    await provide([], source);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await client.loadOsm({ queryArea: { bbox }, ...(source === 'pbf' ? { pbfFileUrl: '/empty.pbf' } : {}),
      autoLoadLayers: { layers: ['buildings', 'roads', 'water', 'parks'] } });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No coastline available/));
    for (const layer of client.getLayersMetadata()) expect((await client.getLayer(layer.name)).features).toEqual([]);
    expect(booleanPointInPolygon([9, 9], (await client.getLayer('table_osm_surface')).features[0] as any)).toBe(true);
  });

  it.each(['api', 'pbf'])('warns and falls back on incomplete %s coastline', async source => {
    await client.setWorkspace(`invalid_coast_${++workspace}`);
    client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
    const elements = structuredClone(extra).filter(element => element.id !== 600);
    elements.find(element => element.id === 810)!.lat = 1;
    elements.find(element => element.id === 812)!.lat = 9;
    await provide(elements, source);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await client.loadOsm({ queryArea: { bbox }, ...(source === 'pbf' ? { pbfFileUrl: '/invalid.pbf' } : {}), autoLoadLayers: { layers: ['surface'] } });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Cannot reconstruct coastline surface/));
    expect(booleanPointInPolygon([9, 9], (await client.getLayer('table_osm_surface')).features[0] as any)).toBe(true);
  });

  it('imports the actual gallery PBF by bbox with all five layers', async () => {
    await client.setWorkspace(`gallery_bbox_${++workspace}`);
    const bytes = await readFile(new URL('../../gallery/public/data/lower_mnt.osm.pbf', import.meta.url));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    const result = await client.loadOsm({ pbfFileUrl: '/data/lower_mnt.osm.pbf',
      queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
      autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] } });
    expect(result.layers).toHaveLength(5);
    expect(client.getLayersMetadata()).toHaveLength(5);
    expect((await client.getLayer('table_osm_surface')).features.length).toBeGreaterThan(0);
    expect((await client.getLayer('table_osm_buildings')).features.length).toBeGreaterThan(0);
    const mask = (await conn.query(`SELECT bool_and(ST_IsValid(geometry)) AS valid_geometry
      FROM ${client.getCurrentWorkspace()}.table_osm_surface`)).toArray()[0];
    expect(mask.valid_geometry).toBe(true);
  }, 120_000);

  it('clears internal-mask metadata when explicitly removing the surface', async () => {
    await client.setWorkspace(`removed_mask_${++workspace}`);
    await provide([], 'api');
    await client.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: ['roads'] } });
    expect(client.getCurrentWorkspaceData().internalLayerNames).toContain('table_osm_surface');
    await client.removeLayer('table_osm_surface');
    expect(client.getCurrentWorkspaceData().internalLayerNames).not.toContain('table_osm_surface');
    expect(client.getCurrentWorkspaceData().workspaceCropLayer).toBeNull();
  });

  it('rejects invalid bbox before network calls in both sources', async () => {
    await client.setWorkspace(`invalid_bbox_${++workspace}`);
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const values of [[0, 0, 1], Array(4), [1, 0, 0, 1], [0, 1, 1, 0], [NaN, 0, 1, 1], [0, 0, Infinity, 1], [-181, 0, 1, 1], [0, -91, 1, 1], [170, 0, -170, 1]]) {
      for (const pbfFileUrl of [undefined, '/invalid.pbf']) {
        await expect(client.loadOsm({ queryArea: { bbox: values as typeof bbox }, pbfFileUrl, autoLoadLayers: { layers: ['surface'] } })).rejects.toThrow(/queryArea.bbox/);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles projected bbox and coastline in the default workspace CRS', async () => {
    await client.setWorkspace(`projected_bbox_${++workspace}`);
    await provide(extra.filter(element => element.id !== 600), 'api');
    await client.loadOsm({ queryArea: { bbox: [0, 0, 10, 10] }, autoLoadLayers: { layers: ['surface', 'roads'] } });
    const extent = await client.getBoundingBoxFromLayer('table_osm_surface');
    expect(extent.maxLon).toBeCloseTo(556597.45, 1);
    expect(extent.maxLat).toBeGreaterThan(1_000_000);
    expect((await client.getLayer('table_osm_roads')).features).toHaveLength(1);
  });
});

describe('bbox Overpass acquisition and cache', () => {
  it('generates balanced building tag filters for both bbox and named queries', () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const box = boundingBoxOf({ bbox });
    const named = { geocodeArea: 'Fixture', areas: ['Test District'] };
    const queries = [api.buildLayerGroupQuery({ bbox }, ['buildings']), api.buildLayerGroupQuery(named, ['buildings']),
      ...api.buildBuildingsTileQueries({ bbox }, box), ...api.buildBuildingsTileQueries(named, box)];
    for (const query of queries) {
      // Ignore quoted tag values/regexes, which may legitimately contain brackets.
      const syntax = query.replace(/"(?:\\.|[^"\\])*"/g, '""');
      let depth = 0;
      for (const token of syntax) {
        if (token === '[') depth++;
        if (token === ']') depth--;
        expect(depth, query).toBeGreaterThanOrEqual(0);
      }
      expect(depth, query).toBe(0);
    }
  });

  it('outputs the selected bbox relations, not the untouched default set', () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const query = api.buildLayerGroupQuery({ bbox }, ['buildings']);
    expect(query).toMatch(/\(\s*\.dataRelations;\s*\);\s*out body;/);
  });

  it('includes the server parse error in a non-retryable HTTP error', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    vi.spyOn(api, 'waitForSlot').mockResolvedValue(undefined);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<html><body><p>Error: line 4: parse error: unexpected closing bracket.</p></body></html>',
      { status: 400, statusText: 'Bad Request' },
    ));
    await expect(api.fetchWithRetry('[out:json];way["building"]];out;')).rejects.toThrow(
      'Overpass API error: 400 Bad Request: Error: line 4: parse error: unexpected closing bracket.',
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('acquires coastlines for named areas even when only surface is requested', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const requests: string[] = [];
    const boundaries = structuredClone(syntheticElements).filter(element => element.id === 900 || element.id === 800 || (element.id >= 700 && element.id <= 703));
    resolveWayGeometries(boundaries);
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => {
      requests.push(query);
      return new Response(JSON.stringify({ elements: query.includes('relation["name"') ? boundaries : [] }));
    });
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData({ geocodeArea: 'Fixture', areas: ['Test District'] }, ['surface'], undefined, true);
    await vi.runAllTimersAsync();
    await run;
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('relation["name"="Test District"]');
    expect(requests[1]).toContain('way["natural"="coastline"](0,0,10,10)');
    expect(requests[1]).not.toContain('area[');
    expect(requests[1]).not.toContain('dataRelations');
  });

  it('fetches coastlines, bbox tiles with complete members, and invalidates pre-coastline cache', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const requests: string[] = [];
    const elements = [{ type: 'way', id: 1, nodes: [1, 2], geometry: [{ lon: 5, lat: -1 }, { lon: 5, lat: 11 }], tags: { natural: 'coastline' } }];
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => {
      requests.push(query);
      return new Response(JSON.stringify({ elements }));
    });
    const cache = new Map<string, unknown>();
    vi.spyOn(HttpCache.prototype, 'get').mockImplementation(async key => cache.get(key) ?? null);
    vi.spyOn(HttpCache.prototype, 'set').mockImplementation(async (key, value) => { cache.set(key, value); });
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData({ bbox }, ['buildings']);
    await vi.runAllTimersAsync();
    const response = await run;
    expect(requests).toHaveLength(5);
    expect(requests[0]).toContain('way["natural"="coastline"](0,0,10,10)');
    for (const query of requests.slice(1)) {
      expect(query).not.toContain('area[');
      expect(query).toContain('relation["type"="building"]');
      expect(query).toContain('way(r.dataRelations)');
    }
    expect(response.elements).toHaveLength(1);
    await api.fetchCombinedOsmData({ bbox }, ['buildings']);
    expect(requests).toHaveLength(5);
    const refresh = api.fetchCombinedOsmData({ bbox }, ['buildings'], undefined, true);
    await vi.runAllTimersAsync();
    await refresh;
    expect(requests).toHaveLength(10);
    expect(api.getCacheKey({ bbox }, ['roads'])).not.toBe(api.getCacheKey({ bbox }, ['buildings']));
    expect(api.getCacheKey({ bbox: [0, 0, 9, 10] }, ['buildings'])).not.toBe(api.getCacheKey({ bbox }, ['buildings']));
    expect(api.getCacheKey({ geocodeArea: 'Fixture', areas: ['Test District'] }, ['buildings'])).toContain('v3');
    expect(boundingBoxOf({ bbox })).toEqual({ west: 0, south: 0, east: 10, north: 10 });
  });
});
