import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { booleanPointInPolygon } from '@turf/turf';
import { loadDb } from '../src/duckdb-node';
import { OsmProcessingPipeline } from '../src/internal/process-osm/pipeline';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';
import { HttpCache } from '../src/http-cache';
import { resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import { encodeBuildingPbf } from './fixtures/building-pipeline';
import type { OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

const area = { geocodeArea: 'Region', areas: ['District'] };
const boundary: OsmElement[] = [
  { type: 'relation', id: 100, tags: { name: 'Region', boundary: 'administrative' }, members: [{ type: 'way', ref: 110, role: 'outer' }] },
  { type: 'way', id: 110, nodes: [111, 112, 113, 114, 111] },
  ...[[0, 0], [20, 0], [20, 20], [0, 20]].map(([lon, lat], i) => ({ type: 'node' as const, id: 111 + i, lon, lat })),
  { type: 'relation', id: 200, tags: { name: 'District', boundary: 'administrative' }, members: [{ type: 'way', ref: 210, role: 'outer' }] },
  { type: 'way', id: 210, nodes: [211, 212, 213, 211] },
  ...[[6, 6], [14, 6], [6, 14]].map(([lon, lat], i) => ({ type: 'node' as const, id: 211 + i, lon, lat })),
];
const coastline: OsmElement[] = [
  // Mainland coastline lies entirely outside District's bbox; still needed to classify it.
  { type: 'way', id: 300, nodes: [301, 302], tags: { natural: 'coastline' } },
  { type: 'node', id: 301, lon: 4, lat: -1 }, { type: 'node', id: 302, lon: 4, lat: 21 },
  // Neighboring island is inside the bbox, but outside District's administrative triangle.
  { type: 'way', id: 400, nodes: [401, 402, 403, 404, 401], tags: { natural: 'coastline' } },
  ...[[10, 10], [12, 10], [12, 12], [10, 12]].map(([lon, lat], i) => ({ type: 'node' as const, id: 401 + i, lon, lat })),
];
const lake: OsmElement[] = [
  { type: 'way', id: 500, nodes: [501, 502, 503, 504, 501], tags: { natural: 'water', water: 'lake' } },
  ...[[7, 7], [8, 7], [8, 8], [7, 8]].map(([lon, lat], i) => ({ type: 'node' as const, id: 501 + i, lon, lat })),
];
let db: AutkDb;
let conn: AsyncDuckDBConnection;
let pipeline: OsmProcessingPipeline;
let serial = 0;
beforeAll(async () => {
  native.db = await loadDb();
  conn = await native.db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
  pipeline = new OsmProcessingPipeline(native.db, conn);
  vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => {
  await (db as any)?.conn?.close(); await conn?.close(); await native.db?.terminate(); vi.unstubAllGlobals();
});

async function provide(elements: OsmElement[], source: string) {
  if (source === 'pbf') {
    const bytes = await encodeBuildingPbf(elements);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
  } else {
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({
      elements: inline.filter(element => element.tags?.natural !== 'coastline'),
      coastlines: inline.filter(element => element.type === 'way' && element.tags?.natural === 'coastline'),
    });
  }
}

describe('geocode-wide coastlines, shared by Overpass and PBF', () => {
  it.each(['api', 'pbf'])('classifies coasts outside areas, protects neighboring islands, and bounds %s water', async source => {
    await db.setWorkspace(`coastal_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
    await provide([...boundary, ...coastline], source);
    const result = await db.loadOsm({ queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/region.pbf' } : {}),
      autoLoadLayers: { layers: ['water'] } });
    const water = await db.getLayer('table_osm_water');
    expect(water.features).toHaveLength(1);
    const sea = water.features[0];
    expect(sea.properties?.generated).toBe('coastline');
    expect(booleanPointInPolygon([13, 13], sea as any)).toBe(true); // outside administrative triangle, within bbox
    expect(booleanPointInPolygon([11, 11], sea as any)).toBe(false); // neighboring land, never water
    expect(booleanPointInPolygon([15, 13], sea as any)).toBe(false); // outside areas' bbox
    expect(result.layers[0].featureCount).toBe(1);
    expect(db.getCurrentWorkspaceData().workspaceCropLayer).toBe('table_osm_surface');
    expect((await db.getLayer('table_osm_water', { osmElements: true })).features).toHaveLength(0); // generated, not an OSM object
  });

  it.each(['api', 'pbf'])('generates no coastal water for an inland %s area but preserves explicit lakes', async source => {
    await db.setWorkspace(`inland_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
    const mainland = structuredClone(coastline.slice(0, 3));
    mainland.filter(element => element.type === 'node').forEach(element => { element.lon = 16; });
    await provide([...boundary, ...mainland, ...lake], source);
    await db.loadOsm({ queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/inland.pbf' } : {}), autoLoadLayers: { layers: ['water'] } });
    const water = await db.getLayer('table_osm_water');
    expect(water.features).toHaveLength(1);
    expect(water.features[0].properties?.water).toBe('lake');
    expect(booleanPointInPolygon([7.5, 7.5], water.features[0] as any)).toBe(true);
  });

  it.each(['api', 'pbf'])('does not infer sea from incomplete %s coastline', async source => {
    await db.setWorkspace(`broken_${++serial}`);
    const broken = structuredClone(coastline);
    broken.find(element => element.id === 302)!.lat = 18;
    await provide([...boundary, ...broken, ...lake], source);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadOsm({ queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/broken.pbf' } : {}), autoLoadLayers: { layers: ['water'] } });
    expect((await db.getLayer('table_osm_water')).features.every(feature => feature.properties?.generated !== 'coastline')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Cannot reconstruct coastline/));
  });

  it.each(['api', 'pbf'])('preserves explicit lakes but infers no sea when %s has no coastlines', async source => {
    await db.setWorkspace(`no_coasts_${++serial}`);
    await provide([...boundary, ...lake], source);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadOsm({ queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/no-coasts.pbf' } : {}), autoLoadLayers: { layers: ['water'] } });
    const water = await db.getLayer('table_osm_water');
    expect(water.features).toHaveLength(1);
    expect(water.features[0].properties?.water).toBe('lake');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No coastline available.*Coastal water is not generated/));
  });

  it.each(['api', 'pbf'])('does not retain old generated water after reloading %s without coastlines', async source => {
    await db.setWorkspace(`reload_coasts_${++serial}`);
    await provide([...boundary, ...coastline], source);
    const params = { queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/region.pbf' } : {}), autoLoadLayers: { layers: ['water' as const] } };
    await db.loadOsm(params);
    expect((await db.getLayer('table_osm_water')).features.some(feature => feature.properties?.generated === 'coastline')).toBe(true);
    await provide([...boundary, ...lake], source);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await db.loadOsm(params);
    const water = await db.getLayer('table_osm_water');
    expect(water.features).toHaveLength(1);
    expect(water.features[0].properties?.water).toBe('lake');
    expect(result.layers[0].featureCount).toBe(1);
  });

  it('does not classify using an areas-only PBF with a missing geocode region', async () => {
    await db.setWorkspace(`missing_geocode_${++serial}`);
    await provide([...boundary.filter(element => element.id !== 100), ...coastline], 'pbf');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadOsm({ queryArea: area, pbfFileUrl: '/areas-only.pbf', autoLoadLayers: { layers: ['water'] } });
    expect((await db.getLayer('table_osm_water')).features).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No complete geocode boundary in PBF/));
  });

  it('collects coastlines by the geocode bbox, while building tiles keep areas bounds', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const inline = structuredClone(boundary); resolveWayGeometries(inline);
    const requests: string[] = [];
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => {
      requests.push(query);
      return new Response(JSON.stringify({ elements: query.includes('.geocodeRelations') ? inline : [{ type: 'way', id: 999 }] }));
    });
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData(area, ['buildings'], undefined, true);
    await vi.runAllTimersAsync(); await run;
    expect(requests).toHaveLength(6);
    expect(requests[0]).toContain('rel(pivot.areaMain)->.geocodeRelations');
    expect(requests[1]).toContain('way["natural"="coastline"](0,0,20,20)');
    expect(requests[1]).not.toContain('area[');
    for (const query of requests.slice(2)) {
      expect(query).not.toContain('(0,0,20,20)');
      expect(query).toContain('relation["name"="District"]');
    }
  });

  it('keeps coastline geometry independent of overlapping thematic member responses', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const boundaries = structuredClone(boundary); resolveWayGeometries(boundaries);
    const coasts = structuredClone(coastline); resolveWayGeometries(coasts);
    const coastWays = coasts.filter(element => element.type === 'way');
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => new Response(JSON.stringify({
      elements: query.includes('.geocodeRelations') ? boundaries
        : query.includes('"natural"="coastline"') ? coastWays
        : [{ ...coastWays[0], geometry: [{ lon: 18, lat: -1 }, { lon: 18, lat: 21 }] }],
    })));
    const cache = vi.spyOn(HttpCache.prototype, 'set').mockResolvedValue(undefined);
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData(area, ['roads'], undefined, true);
    await vi.runAllTimersAsync();
    const response = await run;
    expect(response.coastlines).toEqual(coastWays);
    expect(response.elements.find((element: OsmElement) => element.id === 300).geometry[0].lon).toBe(18);
    expect(response.coastlineExtent).toEqual({ west: 0, south: 0, east: 20, north: 20 });
    expect(cache).toHaveBeenCalledWith(expect.stringContaining('v5'), response);
  });

  it('rejects HTTP-success partial coastline responses and never caches them', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const inline = structuredClone(boundary); resolveWayGeometries(inline);
    vi.spyOn(api, 'fetchWithRetry').mockImplementation(async (query: string) => new Response(JSON.stringify(
      query.includes('.geocodeRelations') ? { elements: inline } : { elements: [], remark: 'runtime error: Query timed out' },
    )));
    const cache = vi.spyOn(HttpCache.prototype, 'set').mockResolvedValue(undefined);
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData(area, ['surface'], undefined, true);
    const assertion = expect(run).rejects.toThrow(/coastline query returned incomplete data/);
    await vi.runAllTimersAsync(); await assertion;
    expect(cache).not.toHaveBeenCalled();
  });
});
