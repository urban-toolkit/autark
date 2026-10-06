import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { readFile } from 'node:fs/promises';
import { OsmProcessingPipeline } from '../src/internal/process-osm/pipeline';
import { selectScopedBoundaryRelations } from '../src/internal/process-osm/named-area';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';
import { resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import { HttpCache } from '../src/http-cache';
import { encodeBuildingPbf } from './fixtures/building-pipeline';
import type { OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

const area = { geocodeArea: 'Region', areas: ['Twin'] };
const elements: OsmElement[] = [];
for (const [id, name, w, s, e, n] of [
  [100, 'Region', 0, 0, 10, 10], [200, 'Twin', 1, 1, 2, 2],
  [300, 'Twin', 20, 20, 21, 21], [400, 'Twin', 4.2, 4.2, 4.8, 4.8],
  [500, 'Hole', 4, 4, 6, 6],
] as const) {
  const first = id + 1;
  elements.push({ type: 'relation', id, tags: { name, boundary: id === 200 ? 'place' : 'administrative', type: 'boundary' },
    members: [{ type: 'way', ref: id + 10, role: 'outer' }] },
  { type: 'way', id: id + 10, nodes: [first, first + 1, first + 2, first + 3, first] },
  ...[[w, s], [e, s], [e, n], [w, n]].map(([lon, lat], index) => ({ type: 'node' as const, id: first + index, lon, lat })));
}
elements.find(element => element.id === 100)!.members!.push({ type: 'way', ref: 510, role: 'inner' });
elements.push({ type: 'relation', id: 600, tags: { name: 'Twin', type: 'route', route: 'bus' }, members: [{ type: 'way', ref: 310, role: '' }] },
  { type: 'way', id: 700, nodes: [701, 702], tags: { highway: 'residential' } },
  { type: 'node', id: 701, lon: 1.2, lat: 1.2 }, { type: 'node', id: 702, lon: 1.8, lat: 1.8 });
let conn: AsyncDuckDBConnection;
let pipeline: OsmProcessingPipeline;
let client: AutkDb;
let serial = 0;
beforeAll(async () => {
  native.db = await loadDb(); conn = await native.db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
  pipeline = new OsmProcessingPipeline(native.db, conn);
  vi.stubGlobal('self', globalThis);
  client = new AutkDb(); await client.init();
}, 120_000);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => { await (client as any)?.conn?.close(); await conn?.close(); await native.db?.terminate(); vi.unstubAllGlobals(); });

describe('named OSM boundaries are scoped by the region, not its bbox', () => {
  it('accepts boundary=place but discards outside homonyms, holes and non-boundary relations', () => {
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    expect(selectScopedBoundaryRelations(inline, area).map(relation => relation.id)).toEqual([200]);
    expect(pipeline.getBoundaryRelationIds(inline, ['Twin'])).not.toContain(600);
    expect(selectScopedBoundaryRelations(inline, { geocodeArea: 'Twin', areas: ['Twin'] }).map(relation => relation.id)).toEqual([200, 300, 400]);
  });

  it('reconstructs reversed open segments and disconnected outer regions while preserving holes', () => {
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    const original = inline.find(element => element.id === 110)!;
    const refs = original.nodes!, geometry = original.geometry!;
    inline.splice(inline.indexOf(original), 1,
      { type: 'way', id: 110, nodes: refs.slice(0, 3), geometry: geometry.slice(0, 3) },
      { type: 'way', id: 111, nodes: refs.slice(2).reverse(), geometry: geometry.slice(2).reverse() });
    inline.find(element => element.id === 100)!.members!.push(
      { type: 'way', ref: 111, role: 'outer' }, { type: 'way', ref: 310, role: 'outer' });
    expect(selectScopedBoundaryRelations(inline, area).map(relation => relation.id)).toEqual([200, 300]);
  });

  it('warns and matches exact boundary names when the region is missing, incomplete or unclosed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    for (const candidate of [inline.filter(element => element.id !== 100), inline.filter(element => element.id !== 110)]) {
      expect(selectScopedBoundaryRelations(candidate, area).map(relation => relation.id)).toEqual([200, 300, 400]);
    }
    inline.find(element => element.id === 110)!.nodes!.pop();
    inline.find(element => element.id === 110)!.geometry!.pop();
    expect(selectScopedBoundaryRelations(inline, area).map(relation => relation.id)).toEqual([200, 300, 400]);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/PBF geocodeArea "Region".*falling back to exact area names.*Homonymous/));
    expect(() => selectScopedBoundaryRelations(inline, { geocodeArea: 'Absent', areas: ['Missing'] })).toThrow(/No area boundary.*Missing/);
  });

  it('rejects a name that is only present outside the region', () => {
    const inline = structuredClone(elements).filter(element => element.id !== 200); resolveWayGeometries(inline);
    expect(() => selectScopedBoundaryRelations(inline, area)).toThrow(/inside "Region".*Twin/);
  });

  it.each(['missing', 'incomplete'])('imports exact-name areas and untagged ways through the public PBF API with a %s region', async state => {
    await client.setWorkspace(`fallback_region_${++serial}`);
    client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
    const fixture = elements.filter(element => element.id !== (state === 'missing' ? 100 : 110));
    const bytes = await encodeBuildingPbf(fixture);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    await client.loadOsm({ queryArea: area, pbfFileUrl: '/fallback.pbf', autoLoadLayers: { layers: ['surface'] } });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/PBF geocodeArea "Region".*falling back/));
    expect(await client.getBoundingBoxFromLayer('table_osm_surface')).toEqual({ minLon: 1, minLat: 1, maxLon: 21, maxLat: 21 });
    expect((await client.getLayer('table_osm_surface')).features).toHaveLength(3);
  });

  it('loads the real gallery named-area PBF with a warning when the New York region is incomplete', async () => {
    await client.setWorkspace(`incomplete_region_${++serial}`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bytes = await readFile(new URL('../../gallery/public/data/lower_mnt.osm.pbf', import.meta.url));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    await client.loadOsm({ pbfFileUrl: '/gallery.pbf',
      queryArea: { geocodeArea: 'New York', areas: ['Battery Park City', 'Financial District'] },
      autoLoadLayers: { layers: ['surface'] } });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/PBF geocodeArea "New York".*incomplete.*falling back/));
    expect((await client.getLayer('table_osm_surface')).features.length).toBeGreaterThan(0);
  }, 120_000);

  it('uses the same scoped relation-to-area query in boundaries, thematic groups and every building tile', () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const queryArea = { geocodeArea: 'Region', areas: ['Twin', 'Other'] };
    const queries = [api.buildBoundariesQuery(queryArea), api.buildLayerGroupQuery(queryArea, ['parks', 'water']),
      api.buildLayerGroupQuery(queryArea, ['roads']), api.buildLayerGroupQuery(queryArea, ['buildings']),
      ...api.buildBuildingsTileQueries(queryArea, { west: 0, south: 0, east: 10, north: 10 })];
    for (const query of queries) {
      expect(query).toContain('area["name"="Region"]["boundary"]->.areaMain');
      for (const [index, name] of queryArea.areas.entries()) {
        expect(query).toContain(`relation["name"="${name}"]["boundary"](area.areaMain)->.rel${index + 1}`);
        expect(query).toContain(`.rel${index + 1} map_to_area->.area${index + 1}`);
        expect(query).not.toContain(`area["name"="${name}"](area.areaMain)`);
      }
    }
  });

  it('invalidates both old named caches without invalidating unchanged bbox selection', async () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const keys: string[] = [];
    vi.spyOn(HttpCache.prototype, 'get').mockImplementation(async key => {
      keys.push(key); return key.includes('v3') ? { elements: [] } : null;
    });
    vi.spyOn(HttpCache.prototype, 'set').mockResolvedValue(undefined);
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    const fetch = vi.spyOn(api, 'fetchWithRetry').mockImplementation(async () => new Response(JSON.stringify({ elements: inline.filter(element => [200, 210].includes(element.id)) })));
    vi.useFakeTimers();
    const run = api.fetchCombinedOsmData(area, ['surface']);
    await vi.runAllTimersAsync(); await run;
    expect(keys).toHaveLength(2); expect(keys.every(key => key.includes('v4'))).toBe(true);
    expect(fetch).toHaveBeenCalled();
    expect(api.getCacheKey({ bbox: [0, 0, 10, 10] }, ['roads'])).toContain('v3-bbox');
  });

  it('produces the same selected surface and roads from real PBF bytes and scoped Overpass responses', async () => {
    const bytes = await encodeBuildingPbf(elements);
    const inline = structuredClone(elements); resolveWayGeometries(inline);
    const selected = inline.filter(element => [200, 210, 700].includes(element.id));
    const snapshots = [];
    for (const source of ['pbf', 'api']) {
      await client.setWorkspace(`named_scope_${++serial}`); client.getCurrentWorkspaceData().coordinateFormat = 'EPSG:4326';
      if (source === 'pbf') vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
      else vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements: selected });
      await client.loadOsm({ queryArea: area, ...(source === 'pbf' ? { pbfFileUrl: '/scope.pbf' } : {}), autoLoadLayers: { layers: ['surface', 'roads'] } });
      snapshots.push([(await client.getLayer('table_osm_surface')).features, (await client.getLayer('table_osm_roads')).features]);
      expect(await client.getBoundingBoxFromLayer('table_osm_surface')).toEqual({ minLon: 1, minLat: 1, maxLon: 2, maxLat: 2 });
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
  });
});
