import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { TriangulatorBuildings } from '@urban-toolkit/autk-core';
import { readFile } from 'node:fs/promises';
import { readOsmPbf, type OsmPbfBlock } from '@osmix/pbf';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { blockToElements, resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';
import { LoadOsmFromPbfUseCase } from '../src/use-cases/load-osm-pbf/use-case';
import { OsmProcessingPipeline } from '../src/internal/process-osm/pipeline';
import { LOAD_LAYER_QUERY } from '../src/use-cases/load-osm-layer/queries';
import { LoadOsmLayerUseCase } from '../src/use-cases/load-osm-layer/use-case';
import { ProcessOsmBuildingsUseCase } from '../src/internal/process-osm-buildings/use-case';
import { PolygonizeOsmSurfaceUseCase } from '../src/internal/process-osm-surface/use-case';
import { GetLayerUseCase } from '../src/use-cases/get-layer/use-case';
import bmcc from './fixtures/bmcc.json';
import { continentalElements, continentalWithBoundary, encodeBuildingPbf, syntheticElements } from './fixtures/building-pipeline';
import type { OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

let conn: AsyncDuckDBConnection;
let pipeline: OsmProcessingPipeline;
let client: AutkDb;
let pbf: Uint8Array;
let realPbf: Uint8Array;
let workspace = 0;

beforeAll(async () => {
  native.db = await loadDb();
  conn = await native.db.connect();
  await conn.query('INSTALL spatial; LOAD spatial; CREATE SCHEMA stages;');
  pipeline = new OsmProcessingPipeline(native.db, conn);
  vi.stubGlobal('self', globalThis);
  client = new AutkDb();
  await client.init();
  pbf = await encodeBuildingPbf(syntheticElements);
  realPbf = await encodeBuildingPbf(continentalWithBoundary);
}, 120_000);

afterAll(async () => {
  await (client as any)?.conn?.close();
  await conn?.close();
  await native.db?.terminate();
  vi.unstubAllGlobals();
});
afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  await pipeline.insertOsmDataUsingJson('raw', { elements: structuredClone(syntheticElements) }, 'stages');
  await client.setWorkspace(`pipeline_${++workspace}`);
});

describe('BMCC 3361059 diagnosis and resilient import', () => {
  it('completes the gallery PBF through the public API despite invalid geometry and conflicting ownership', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const split = vi.spyOn(OsmProcessingPipeline.prototype, 'splitCombinedResponse');
    const bytes = await readFile(new URL('../../gallery/public/data/lower_mnt.osm.pbf', import.meta.url));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    const result = await client.loadOsm({ pbfFileUrl: '/lower_mnt.osm.pbf',
      queryArea: { geocodeArea: 'New York', areas: ['Battery Park City', 'Financial District'] },
      autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] } });
    expect(result.layers).toHaveLength(5);
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 3361059.*invalid geometry/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 17894885.*invalid geometry/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relations 2100893, 3495011.*conflicting ownership/));
    for (const id of [812927889,812917195]) {
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`Skipping OSM building part ${id}.*location=underground`)));
      expect(output.features.some(feature => feature.properties?.parts.some((part: any) => part.id === id))).toBe(false);
    }
    const federal = output.features.find(feature => feature.properties?.parts.some((part: any) => part.id === 277904718));
    const hotel = output.features.find(feature => feature.properties?.parts.some((part: any) => part.id === 278039445));
    expect(federal).toBeDefined();
    expect(hotel).toBeDefined();
    expect(federal!.id).not.toBe(hotel!.id);
    for (const [relationId, orphanIds, outlineId, partCount] of [
      ['11518958', [3845959,289386871], 277904717, 21], // Barclay Tower
      ['3494930', [260429306,260429356], 42455776, 38], // One Financial Square
    ] as const) {
      const building = output.features.find(feature => feature.properties?.osmRelation?.id === relationId);
      expect(building).toBeDefined();
      expect(building!.properties?.parts).toHaveLength(partCount);
      expect(building!.properties?.parts.map((part: any) => part.id)).toEqual(expect.arrayContaining([...orphanIds,outlineId]));
      expect(building!.properties?.osmRelation.inferredParts).toEqual(orphanIds.map(id => ({ id: String(id), method: 'outline-containment' })));
      for (const id of orphanIds) {
        expect(output.features.filter(feature => feature.properties?.parts.some((part: any) => part.id === id))).toHaveLength(1);
      }
    }
    expect(client.getTablesMetadata().some(table => table.name === 'table_osm' || table.name === 'table_osm_boundaries')).toBe(false);
    expect((await conn.query(`SELECT COUNT(*) n FROM ${client.getCurrentWorkspace()}.table_osm_buildings WHERE NOT ST_IsValid(geometry)`)).toArray()[0].n).toBe(0n);
    // Replay exactly the same selected snapshot as Overpass relations + inline ways.
    // This isolates source decoding from live OSM updates and incomplete local extracts.
    const layers = ['surface', 'parks', 'water', 'roads', 'buildings'] as const;
    const expected = new Map();
    for (const layer of layers) {
      const collection = await client.getLayer(`table_osm_${layer}`);
      expected.set(layer, collection.features.sort((a,b) => Number(a.id)-Number(b.id)));
    }
    const inline = structuredClone(split.mock.calls[0][0]);
    inline.elements = inline.elements.filter(element => element.type !== 'node');
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue(inline);
    await client.setWorkspace(`gallery_api_replay_${workspace}`);
    await client.loadOsm({ queryArea: { geocodeArea: 'New York', areas: ['Battery Park City', 'Financial District'] },
      forceRefresh: true, autoLoadLayers: { layers: [...layers] } });
    for (const layer of layers) {
      const collection = await client.getLayer(`table_osm_${layer}`);
      expect(collection.features.sort((a,b) => Number(a.id)-Number(b.id))).toEqual(expected.get(layer));
    }
  }, 120_000);

  it('reproduces invalid polygon topology from valid individual rings before projection/clipping', async () => {
    await pipeline.insertOsmDataUsingJson('bmcc', { elements: structuredClone(bmcc.elements) as OsmElement[] }, 'stages');
    const loader = new LoadOsmLayerUseCase(native.db!, conn) as any;
    const { records } = await loader.buildRelationAreaRecords('bmcc', 'buildings', 'stages');
    expect(records).toHaveLength(1);
    expect(records[0].geometry.type).toBe('Polygon');
    expect(records[0].geometry.coordinates).toHaveLength(5); // One outer and four inner rings.
    const source = JSON.stringify(records[0].geometry).replace(/'/g, "''");
    const rows = (await conn.query(`WITH polygon AS (SELECT '${source}'::JSON geometry), rings AS (
      SELECT UNNEST(from_json(geometry->'coordinates','[[["DOUBLE"]]]')) coords,
        UNNEST(range(json_array_length(geometry->'coordinates')::BIGINT)) ring_index FROM polygon
    ) SELECT ring_index, ST_IsValid(ST_GeomFromGeoJSON(json_object('type','Polygon','coordinates',to_json([coords])))) valid_geometry
      FROM rings ORDER BY ring_index`)).toArray();
    expect(rows.map(row => row.valid_geometry)).toEqual([true, true, true, true, true]);
    const topology = (await conn.query(`WITH source AS (SELECT '${source}'::JSON geometry), polygons AS (
      SELECT ST_GeomFromGeoJSON(geometry) geom,
        ST_GeomFromGeoJSON(json_object('type','Polygon','coordinates',json_array(geometry->'coordinates'->0))) outer_geom,
        ST_GeomFromGeoJSON(json_object('type','Polygon','coordinates',json_array(geometry->'coordinates'->2))) inner_geom
      FROM source
    ) SELECT ST_IsValid(geom) valid_geometry, ST_Covers(outer_geom,inner_geom) covers_inner,
      ST_Length(ST_Intersection(ST_Boundary(outer_geom),ST_Boundary(inner_geom))) shared_edge_length FROM polygons`)).toArray()[0];
    expect(topology.valid_geometry).toBe(false);
    expect(topology.covers_inner).toBe(false);
    expect(topology.shared_edge_length).toBeGreaterThan(0);
    const relation = bmcc.elements.find(element => element.type === 'relation')!;
    const outerRefs = new Set(bmcc.elements.filter(element => element.type === 'way' && relation.members.some(member => member.ref === element.id && member.role === 'outer'))
      .flatMap(element => 'nodes' in element ? element.nodes : []));
    const inner = bmcc.elements.find(element => element.id === 1446060869)!;
    expect('nodes' in inner && inner.nodes.filter(ref => outerRefs.has(ref))).toEqual(expect.arrayContaining([2565683746, 2565683755, 2565683753, 2565683761]));
  });

  it('logs the real invalid relation and still completes public PBF import, surface filtering, export and cleanup', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(continentalWithBoundary);
    const bounds = [[-74.02,40.699],[-73.999,40.699],[-73.999,40.72],[-74.02,40.72]];
    elements.filter(element => element.type === 'node' && element.id >= 700 && element.id <= 703)
      .forEach(element => { [element.lon, element.lat] = bounds[element.id - 700]; });
    elements.push(...structuredClone(bmcc.elements) as OsmElement[]);
    const bytes = await encodeBuildingPbf(elements);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    const result = await client.loadOsm({ pbfFileUrl: '/bmcc.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } });
    expect(result.layers.find(layer => layer.layerType === 'buildings')?.featureCount).toBe(1);
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features).toHaveLength(1);
    expect(output.features[0].properties?.osmRelation.id).toBe('2100893');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 3361059.*invalid geometry/));
    expect(client.getTablesMetadata().map(table => table.name).sort()).toEqual(['table_osm_buildings', 'table_osm_surface']);
    expect((await conn.query(`SELECT COUNT(*) n FROM ${client.getCurrentWorkspace()}.table_osm_buildings WHERE NOT ST_IsValid(geometry)`)).toArray()[0].n).toBe(0n);
  });
});

describe('Overpass and PBF source parity', () => {
  it('requests type=building relations in both grouped and tiled queries, not just type=building ways', () => {
    const api = new LoadOsmFromOverpassApiUseCase(conn, pipeline) as any;
    const area = { geocodeArea: 'Fixture', areas: ['Test District'] };
    const queries = [api.buildLayerGroupQuery(area, ['buildings']),
      ...api.buildBuildingsTileQueries(area, { south: 0, north: 10, west: 0, east: 10 })];
    expect(queries).toHaveLength(5);
    for (const query of queries) {
      expect(query).toContain('relation["type"="building"]');
      expect(query).toContain('way(r.dataRelations1)');
      expect(query).toContain('out body;');
    }
    // Entries produced by the old, incomplete queries must not be reused.
    expect(api.getCacheKey(area, ['buildings'])).not.toBe('overpass-combined-Fixture-Test District-layers:buildings');
    expect(api.getFullDataCacheKey(area)).not.toBe('overpass-combined-Fixture-Test District');
  });

  it('produces identical buildings and water from the same snapshot via PBF and Overpass-shaped responses', async () => {
    const elements = structuredClone(syntheticElements);
    elements.find(element => element.type === 'way' && element.id === 50)!.tags = {};
    elements.push({ type: 'relation', id: 600, tags: { type: 'building', name: 'Whole building', height: '30' },
      members: [{ type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 50, role: 'part' }] });
    const waterWay = structuredClone(elements.find(element => element.type === 'way' && element.id === 20)!);
    waterWay.id = 60;
    waterWay.tags = { natural: 'water', water: 'pond' };
    const parkWay = structuredClone(waterWay);
    parkWay.id = 61;
    parkWay.tags = { leisure: 'park' };
    const roadWay = structuredClone(waterWay);
    roadWay.id = 62;
    roadWay.tags = { highway: 'residential' };
    elements.push(waterWay, parkWay, roadWay);
    const bytes = await encodeBuildingPbf(elements);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    const inline = structuredClone(elements);
    resolveWayGeometries(inline);
    // Mock only the remote response: real formatting, DuckDB and layer extraction run below.
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData')
      .mockResolvedValue({ elements: inline.filter(element => element.type !== 'node') });
    const layers = ['surface', 'parks', 'water', 'roads', 'buildings'] as const;
    const params = { queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] }, outputTableName: 'parity',
      autoLoadLayers: { layers: [...layers] } };
    const exported = [];
    for (const source of ['pbf', 'api']) {
      await client.setWorkspace(`parity_${source}_${workspace}`);
      const result = await client.loadOsm({ ...params, ...(source === 'pbf' ? { pbfFileUrl: '/parity.pbf' } : { forceRefresh: true }) });
      expect(result.layers).toHaveLength(5);
      const collections = new Map();
      for (const layer of layers) {
        const output = await client.getLayer(`parity_${layer}`);
        collections.set(layer, output.features.sort((a,b) => Number(a.id)-Number(b.id)));
      }
      exported.push(collections);
      expect(client.getTablesMetadata().some(table => table.name === 'parity' || table.name === 'parity_boundaries')).toBe(false);
    }
    for (const layer of layers) expect(exported[0].get(layer)).toEqual(exported[1].get(layer));
    expect(exported[0].get('buildings').find((feature: any) => feature.properties?.osmRelation?.id === '600')?.properties?.parts.map((part: any) => part.id)).toEqual([10,50]);
    expect(exported[0].get('buildings').find((feature: any) => feature.id === 20)?.properties?.osmRelation).toBeUndefined();
    for (const layer of ['surface', 'parks', 'water', 'roads']) expect(exported[0].get(layer)).toHaveLength(1);
    expect(exported[0].get('water')[0].id).toBe(60);
  });
});

describe('building relations preserve original way ownership', () => {
  it('collects disconnected untagged members, inherits relation height and keeps part overrides and exact coordinates', async () => {
    const elements = structuredClone(syntheticElements).filter(element => element.type === 'node'
      || (element.type === 'way' && [10, 50].includes(element.id)));
    elements.find(element => element.type === 'way' && element.id === 10)!.tags = { name: 'Part name', 'building:height': '12' };
    elements.find(element => element.type === 'way' && element.id === 50)!.tags = {};
    elements.push({ type: 'relation', id: 600, tags: { type: 'building', name: 'Whole building', height: '30' },
      members: [{ type: 'way', ref: 50, role: 'part' }, { type: 'way', ref: 10, role: 'outline' }] });
    await pipeline.insertOsmDataUsingJson('related', { elements }, 'stages');
    await conn.query(LOAD_LAYER_QUERY({ tableName: 'related', layer: 'buildings', outputTableName: 'original_members',
      workspace: 'stages', sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:4326' }));
    const original = (await conn.query('SELECT id, ST_AsWKB(geometry) AS bytes FROM stages.original_members ORDER BY id')).toArray();
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'related', layer: 'buildings',
      outputTableName: 'related_buildings', workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features).toHaveLength(1);
    expect(output.features[0].id).toBe(10);
    expect(output.features[0].properties).toMatchObject({ name: 'Whole building', height: '30',
      osmRelation: { id: '600', members: [{ id: '50', role: 'part' }, { id: '10', role: 'outline' }] },
      parts: [{ id: 10, geometryIndex: 0, name: 'Part name', 'building:height': '12' }, { id: 50, geometryIndex: 1 }] });
    const collected = (await conn.query(`SELECT CAST(properties->'parts'->(part.path[1]-1)->>'id' AS BIGINT) AS id,
      ST_AsWKB(part.geom) AS bytes FROM stages.related_buildings, UNNEST(ST_Dump(geometry)) t(part) ORDER BY id`)).toArray();
    expect(collected).toEqual(original);
    const [meshes] = TriangulatorBuildings.buildMesh(output, [0, 0]);
    const heights = [[], []] as number[][];
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.position.length; i += 3) heights[mesh.position[i] < 10 ? 0 : 1].push(mesh.position[i + 2]);
    }
    expect(Math.max(...heights[0])).toBe(12);
    expect(Math.max(...heights[1])).toBe(30);
  });

  it('does not merge distinct explicit building relations even when their ways overlap', async () => {
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 600, tags: { type: 'building', name: 'A' }, members: [{ type: 'way', ref: 10, role: 'part' }] },
      { type: 'relation', id: 601, tags: { type: 'building', name: 'B' }, members: [{ type: 'way', ref: 20, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('separate', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'separate', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    const related = output.features.filter(feature => feature.properties?.osmRelation);
    expect(related.map(feature => [feature.id, feature.properties?.name, feature.properties?.parts.length]).sort())
      .toEqual([[10, 'A', 1], [20, 'B', 1]]);
  });

  it('deduplicates repeated member refs and keeps node/way/relation ID namespaces separate', async () => {
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 10, tags: { type: 'building' },
      members: [{ type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 10, role: 'part' }, { type: 'node', ref: 10, role: 'label' }] },
    { type: 'node', id: 10, lon: 99, lat: 40 });
    await pipeline.insertOsmDataUsingJson('namespaces', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'namespaces', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    const related = output.features.find(feature => feature.properties?.osmRelation)!;
    expect(related.properties?.osmRelation).toMatchObject({ id: '10', members: [{ id: '10', role: 'part' }] });
    expect(related.properties?.parts).toHaveLength(1);
    expect(related.geometry).toMatchObject({ type: 'GeometryCollection', geometries: [
      { type: 'Polygon', coordinates: [[[1,1],[4,1],[4,4],[1,4],[1,1]]] },
    ] });
  });

  it('logs conflicting ownership and skips both relations while continuing unrelated buildings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 600, tags: { type: 'building' }, members: [{ type: 'way', ref: 10, role: 'part' }] },
      { type: 'relation', id: 601, tags: { type: 'building' }, members: [{ type: 'way', ref: 10, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('ambiguous', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'ambiguous', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features.map(feature => feature.id).sort()).toEqual([20, 30, 40, 50]);
    expect(output.features.some(feature => feature.properties?.osmRelation)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relations 600, 601.*way 10 has conflicting ownership/));
  });

  it('logs missing geometry members and skips the whole relation rather than storing a partial building', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 600, tags: { type: 'building' },
      members: [{ type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 999, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('missing', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'missing', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features.map(feature => feature.id)).not.toContain(10);
    expect(output.features.some(feature => feature.properties?.osmRelation)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relation 600.*ways 999/));
  });

  it('logs open member ways and skips their relation instead of storing non-polygonal parts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    elements.find(element => element.type === 'way' && element.id === 10)!.nodes = [100, 101, 102];
    elements.push({ type: 'relation', id: 600, tags: { type: 'building' }, members: [{ type: 'way', ref: 10, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('open_member', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'open_member', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    expect((await new GetLayerUseCase(conn).exec(table, 'stages')).features.some(feature => feature.properties?.osmRelation)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 10.*non-polygonal geometry/));
  });

  it.each([
    { members: [{ type: 'relation' as const, ref: 999, role: 'part' }, { type: 'way' as const, ref: 10, role: 'part' }], error: /unsupported member 999/ },
    { members: [{ type: 'way' as const, ref: 10, role: 'inner' }], error: /unsupported member 10/ },
    { members: [{ type: 'way' as const, ref: 20, role: 'roof' }, { type: 'way' as const, ref: 10, role: 'part' }], error: /unsupported member 20.*role roof/ },
    { members: [{ type: 'way' as const, ref: 10, role: 'part' }, { type: 'way' as const, ref: 10, role: 'outline' }], error: /conflicting roles for way 10/ },
    { members: [{ type: 'node' as const, ref: 100, role: 'label' }], error: /no way members/ },
    { members: [], error: /no way members/ },
  ])('logs unsupported/incomplete membership and continues other buildings: $error', async ({ members, error }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 600, tags: { type: 'building' }, members },
      { type: 'relation', id: 601, tags: { type: 'building' }, members: [{ type: 'way', ref: 30, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('unsupported', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'unsupported', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(error));
    expect(output.features.some(feature => feature.properties?.osmRelation?.id === '600')).toBe(false);
    expect(output.features.some(feature => feature.properties?.osmRelation?.id === '601')).toBe(true);
    const omitted = members.filter(member => member.type === 'way').map(member => member.ref);
    for (const feature of output.features) {
      expect(feature.properties?.parts.some((part: any) => omitted.includes(part.id))).toBe(false);
    }
    expect(output.features.some(feature => feature.id === 40)).toBe(true);
  });

  it.each(['api', 'pbf'])('public %s import survives unsupported roof members and completes all layers', async source => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    elements.push({ type: 'relation', id: 15931242, tags: { type: 'building' }, members: [
      { type: 'way', ref: 20, role: 'roof' }, { type: 'way', ref: 10, role: 'part' },
    ] }, { type: 'relation', id: 601, tags: { type: 'building' }, members: [{ type: 'way', ref: 30, role: 'part' }] });
    if (source === 'pbf') {
      const bytes = await encodeBuildingPbf(elements);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    } else {
      resolveWayGeometries(elements);
      vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements });
    }
    const result = await client.loadOsm({ queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      ...(source === 'pbf' ? { pbfFileUrl: '/roof.pbf' } : {}), autoLoadLayers: { layers: ['surface', 'buildings', 'roads', 'water', 'parks'] } });
    expect(result.layers).toHaveLength(5);
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features.map(feature => feature.id)).toEqual([30]);
    expect(output.features[0].properties?.osmRelation?.id).toBe('601');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relation 15931242.*unsupported member 20.*role roof/));
    expect(client.getTablesMetadata().some(table => ['table_osm', 'table_osm_boundaries'].includes(table.name))).toBe(false);
  });

  it('still assembles genuine multipolygon relations with inner rings as polygons with holes', async () => {
    const elements = structuredClone(syntheticElements).filter(element => element.type === 'node'
      || (element.type === 'way' && [10, 20].includes(element.id)));
    elements.filter(element => element.type === 'way').forEach(element => { element.tags = {}; });
    const positions = [[2,2],[3,2],[3,3],[2,3]];
    elements.filter(element => element.type === 'node' && element.id >= 200 && element.id <= 203)
      .forEach(element => { [element.lon, element.lat] = positions[element.id - 200]; });
    elements.push({ type: 'relation', id: 600, tags: { type: 'multipolygon', building: 'yes', height: '12' },
      members: [{ type: 'way', ref: 10, role: 'outer' }, { type: 'way', ref: 20, role: 'inner' }] });
    await pipeline.insertOsmDataUsingJson('multipolygon', { elements }, 'stages');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'multipolygon', layer: 'buildings',
      workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features).toHaveLength(1);
    expect(output.features[0].id).toBe(600);
    expect(output.features[0].geometry).toMatchObject({ type: 'GeometryCollection', geometries: [
      { type: 'Polygon', coordinates: [[[1,1],[4,1],[4,4],[1,4],[1,1]], [[2,2],[3,2],[3,3],[2,3],[2,2]]] },
    ] });
    expect((await conn.query('SELECT ST_IsValid(geometry) AS valid_geometry FROM stages.multipolygon_buildings')).toArray()[0].valid_geometry).toBe(true);
  });
});

describe('building import pipeline — stages', () => {
  it('1. decodes regular/dense nodes, delta refs, tags and relation roles', () => {
    const block: OsmPbfBlock = {
      stringtable: ['', 'building', 'yes', 'height', '12', 'name', 'Test District', 'outer'].map(value => new TextEncoder().encode(value)),
      primitivegroup: [{
        nodes: [{ id: 9, lat: 2e7, lon: 3e7, keys: [], vals: [] }],
        dense: { id: [1, 1, 1], lat: [0, 0, 1e7], lon: [0, 1e7, -1e7], keys_vals: [0, 0, 0] },
        ways: [{ id: 10, keys: [1, 3], vals: [2, 4], refs: [1, 1, 1, -2] }],
        relations: [{ id: 900, keys: [5], vals: [6], memids: [10], roles_sid: [7], types: [1] }],
      }],
    };
    const elements = blockToElements(block);
    expect(elements.filter(element => element.type === 'node').map(element => [element.id, element.lon, element.lat]))
      .toEqual([[9, 3, 2], [1, 0, 0], [2, 1, 0], [3, 0, 1]]);
    const way = elements.find(element => element.type === 'way')!;
    expect(way.nodes).toEqual([1, 2, 3, 1]);
    expect(way.tags).toEqual({ building: 'yes', height: '12' });
    expect(elements.find(element => element.type === 'relation')?.members).toEqual([{ type: 'way', ref: 10, role: 'outer' }]);
    resolveWayGeometries(elements);
    expect(way.geometry).toEqual([{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 0, lat: 1 }, { lon: 0, lat: 0 }]);
  });

  it('1. decodes the real Continental Center fixture from the gallery PBF without changing its members', async () => {
    const bytes = await readFile(new URL('../../gallery/public/data/lower_mnt.osm.pbf', import.meta.url));
    const { blocks } = await readOsmPbf(new Uint8Array(bytes));
    const expectedKeys = new Set(continentalElements.map(element => `${element.type}/${element.id}`));
    const selected: OsmElement[] = [];
    for await (const block of blocks) {
      selected.push(...blockToElements(block).filter(element => expectedKeys.has(`${element.type}/${element.id}`)));
    }
    expect(selected).toHaveLength(23); // relation + 2 ways + 20 nodes
    expect(selected).toEqual(expect.arrayContaining(continentalElements));
  }, 30_000);

  it('2. discovers the requested administrative relation and its boundary ways', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const loader = new LoadOsmFromPbfUseCase(conn, pipeline) as any;
    const context = await loader.collectBoundaryContext('/fixture.pbf', ['Test District']);
    expect([...context.boundaryRelationIds]).toEqual([900]);
    expect([...context.boundaryWayIds]).toEqual([800]);
    expect(fetch).toHaveBeenCalledOnce();
    await expect(loader.collectBoundaryContext('/fixture.pbf', ['Missing District'])).rejects.toThrow(/Missing District/);
  });

  it('3. resolves boundary nodes and computes the bbox without clipping building coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const loader = new LoadOsmFromPbfUseCase(conn, pipeline) as any;
    expect(await loader.collectBoundaryBbox('/fixture.pbf', new Set([800])))
      .toEqual({ south: 0, north: 10, west: 0, east: 10 });
  });

  it('4. scans real PBF bytes, selects thematic ways/nodes and separates raw boundaries', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const progress = vi.fn();
    const result = await new LoadOsmFromPbfUseCase(conn, pipeline).exec({
      pbfFileUrl: '/fixture.pbf', outputTableName: 'scanned', workspace: 'stages', onProgress: progress,
      queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] }, autoLoadLayers: { layers: ['surface', 'buildings'] },
    });
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(progress.mock.calls.flat()).toEqual(['downloading-osm-data', 'processing-osm-data', 'processing-boundaries']);
    expect(result.tables.map(table => table.name)).toEqual(['scanned', 'scanned_boundaries']);
    const rows = (await conn.query("SELECT id FROM stages.scanned WHERE kind='way' AND map_extract(tags,'__autk_layer')[1]='buildings' ORDER BY id")).toArray();
    expect(rows.map(row => Number(row.id))).toEqual([10, 20, 30, 40]); // 50 is outside bbox; 40 is not polygon-filtered yet.
    expect((await conn.query("SELECT MAX(lon) AS x FROM stages.scanned WHERE kind='node' AND id IN (300,301,302,303)")).toArray()[0].x).toBe(11);
    expect((await conn.query("SELECT id FROM stages.scanned_boundaries WHERE kind='way'")).toArray().map(row => Number(row.id))).toEqual([800]);
    expect((await conn.query("SELECT COUNT(*) AS n FROM stages.scanned_boundaries WHERE kind='node'")).toArray()[0].n).toBe(3n);
  });

  it('4. keeps all member ways/nodes of a selected building relation, even when one member is outside the bbox', async () => {
    const bytes = await encodeBuildingPbf([...syntheticElements, {
      type: 'relation', id: 600, tags: { type: 'building' },
      members: [{ type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 50, role: 'part' }],
    }]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    await new LoadOsmFromPbfUseCase(conn, pipeline).exec({
      pbfFileUrl: '/members.pbf', outputTableName: 'members', workspace: 'stages',
      queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] }, autoLoadLayers: { layers: ['buildings'] },
    });
    expect(Array.from((await conn.query("SELECT refs FROM stages.members WHERE kind='relation' AND id=600")).toArray()[0].refs, Number)).toEqual([10, 50]);
    expect((await conn.query("SELECT COUNT(*) AS n FROM stages.members WHERE kind='way' AND id=50")).toArray()[0].n).toBe(1n);
    expect((await conn.query("SELECT COUNT(*) AS n FROM stages.members WHERE kind='node' AND id IN (500,501,502,503)")).toArray()[0].n).toBe(4n);
  });

  it('5. formats tags and inline nodes without duplicating the closing node or altering relation roles', () => {
    const elements = structuredClone(continentalElements);
    resolveWayGeometries(elements);
    const formatted = pipeline.formatOsmDataForJson({ elements });
    expect(formatted.filter(element => element.kind === 'node')).toHaveLength(20);
    const relation = formatted.find(element => element.kind === 'relation')!;
    expect(relation.refs).toEqual([68312552, 156973723]);
    expect(relation.ref_roles).toEqual(['', '']);
    expect(relation.ref_types).toEqual(['way', 'way']);
    expect(relation.tags).toContainEqual({ k: '__autk_layer', v: 'buildings' });
    const way = formatted.find(element => element.id === 68312552 && element.kind === 'way')!;
    expect(way.tags).toContainEqual({ k: 'height', v: '160' });
    expect(way.refs).toEqual(continentalElements.find(element => element.id === 68312552)!.nodes);
  });

  it('6. inserts typed raw records and cleans the temporary JSON file', async () => {
    const register = vi.spyOn(native.db!, 'registerFileText');
    const drop = vi.spyOn(native.db!, 'dropFile');
    await pipeline.insertOsmDataUsingJson('inserted', { elements: structuredClone(continentalElements) }, 'stages');
    const row = (await conn.query("SELECT refs, ref_roles, ref_types, CAST(tags AS JSON) AS tags_json FROM stages.inserted WHERE kind='relation'")).toArray()[0];
    expect(Array.from(row.refs, Number)).toEqual([68312552, 156973723]);
    expect(Array.from(row.ref_roles)).toEqual(['', '']);
    expect(Array.from(row.ref_types)).toEqual(['way', 'way']);
    expect(JSON.parse(row.tags_json)).toMatchObject({ name: 'Continental Center', type: 'building', __autk_layer: 'buildings' });
    expect((await conn.query('SELECT COUNT(*) AS n FROM stages.inserted')).toArray()[0].n).toBe(23n);
    expect(register).toHaveBeenCalledOnce();
    expect(drop).toHaveBeenCalledWith(register.mock.calls[0][0]);
  });

  it('7. extracts closed way polygons in node order and transforms their CRS', async () => {
    await conn.query(LOAD_LAYER_QUERY({ tableName: 'raw', layer: 'buildings', outputTableName: 'parts', workspace: 'stages',
      sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:3395' }));
    const rows = (await conn.query(`SELECT id, ST_IsValid(geometry) AS valid_geometry, CAST(properties AS JSON) AS properties,
      ST_AsGeoJSON(ST_Transform(geometry,'EPSG:3395','EPSG:4326',always_xy:=true)) AS geometry_json FROM stages.parts ORDER BY id`)).toArray();
    expect(rows.map(row => Number(row.id))).toEqual([10, 20, 30, 40, 50]);
    expect(rows.every(row => row.valid_geometry)).toBe(true);
    expect(JSON.parse(rows[0].properties).height).toBe('12');
    const geometry = JSON.parse(rows[0].geometry_json);
    expect(geometry.type).toBe('Polygon');
    const expected = [[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]];
    geometry.coordinates[0].forEach((position: number[], i: number) => {
      expect(position[0]).toBeCloseTo(expected[i][0], 8);
      expect(position[1]).toBeCloseTo(expected[i][1], 8);
    });
  });

  it('8. keeps the two original polygons without appending a geometry for type=building', async () => {
    await pipeline.insertOsmDataUsingJson('real', { elements: structuredClone(continentalElements) }, 'stages');
    await conn.query(LOAD_LAYER_QUERY({ tableName: 'real', layer: 'buildings', outputTableName: 'relation_parts', workspace: 'stages',
      sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:4326' }));
    const loader = new LoadOsmLayerUseCase(native.db!, conn) as any;
    expect(await loader.appendRelationAreaGeometries({ inputTableName: 'real', outputTableName: 'relation_parts', layer: 'buildings',
      workspace: 'stages', sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:4326' })).toBe(0);
    const rows = (await conn.query('SELECT id, ST_IsValid(geometry) AS valid_geometry, ST_GeometryType(geometry) AS kind FROM stages.relation_parts ORDER BY id')).toArray();
    expect(rows.map(row => [Number(row.id), row.kind, row.valid_geometry])).toEqual([
      [68312552, 'POLYGON', true], [156973723, 'POLYGON', true],
    ]);
    const comparison = (await conn.query(`SELECT ST_IsValid(ST_GeomFromGeoJSON(json_object('type','GeometryCollection',
      'geometries',to_json(list(ST_AsGeoJSON(part.geom)::JSON))))) AS valid_geometry
      FROM stages.relation_parts, UNNEST(ST_Dump(geometry)) t(part)`)).toArray()[0];
    expect(comparison.valid_geometry).toBe(true); // Representation issue, not individually invalid original polygons.
  });

  it('9. logs an invalid original way, skips its whole building relation and continues other features', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elements = structuredClone(syntheticElements);
    const positions = [[1,1],[4,4],[4,1],[1,4]];
    elements.filter(element => element.type === 'node' && element.id >= 100 && element.id <= 103)
      .forEach(element => { [element.lon, element.lat] = positions[element.id - 100]; });
    elements.push({ type: 'relation', id: 600, tags: { type: 'building' },
      members: [{ type: 'way', ref: 10, role: 'part' }, { type: 'way', ref: 20, role: 'part' }] });
    await pipeline.insertOsmDataUsingJson('real', { elements }, 'stages');
    const process = vi.spyOn(ProcessOsmBuildingsUseCase.prototype, 'exec');
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'real', layer: 'buildings',
      outputTableName: 'filtered', workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    expect(process).toHaveBeenCalledOnce();
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features.map(feature => feature.id).sort()).toEqual([30, 40, 50]);
    expect(output.features.some(feature => feature.properties?.osmRelation)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 10.*invalid geometry/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relation 600.*all member ways omitted/));
  });

  it('10. consolidates valid ways to one feature with original indexed parts and distinct heights', async () => {
    const table = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'raw', layer: 'buildings',
      outputTableName: 'collected', workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const output = await new GetLayerUseCase(conn).exec(table, 'stages');
    expect(output.features.map(feature => feature.id).sort()).toEqual([10, 30, 40, 50]);
    const building = output.features.find(feature => feature.id === 10)!;
    expect(building.geometry).toMatchObject({ type: 'GeometryCollection', geometries: [
      { type: 'Polygon', coordinates: [[[1,1],[4,1],[4,4],[1,4],[1,1]]] },
      { type: 'Polygon', coordinates: [[[3,1],[6,1],[6,4],[3,4],[3,1]]] },
    ] });
    expect(building.properties?.parts.map((part: any) => [part.id, part.geometryIndex, part.height])).toEqual([[10, 0, '12'], [20, 1, '25']]);
    expect(table.columns.some(column => column.name === 'agg_geometry')).toBe(false);
  });

  it('11. polygonizes the surface: points inside its bbox can still be outside its polygon', async () => {
    const boundaries = pipeline.splitCombinedResponse({ elements: structuredClone(syntheticElements) }, { geocodeArea: 'Fixture', areas: ['Test District'] });
    await pipeline.insertOsmDataUsingJson('raw_boundaries', boundaries.boundariesData, 'stages', true);
    const surface = await new LoadOsmLayerUseCase(native.db!, conn).exec({ osmInputTableName: 'raw', layer: 'surface',
      outputTableName: 'surface', workspace: 'stages', workspaceCoordinateFormat: 'EPSG:4326' });
    const updated = await new PolygonizeOsmSurfaceUseCase(native.db!, conn).exec({ surfaceTableName: 'surface', workspace: 'stages' }, surface);
    expect(updated.type).toBe('surface');
    const row = (await conn.query('SELECT ST_GeometryType(geometry) AS kind, ST_Contains(geometry,ST_Point(1,1)) AS inside, ST_Contains(geometry,ST_Point(8,8)) AS outside FROM stages.surface')).toArray()[0];
    expect(row.kind).toBe('POLYGON');
    expect(row.inside).toBe(true);
    expect(row.outside).toBe(false);
  });
});

describe('building import pipeline — public orchestration', () => {
  it('12. applies surface filtering only after all layers have been extracted', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const events: string[] = [];
    let originalCrossingGeometry: Uint8Array | undefined;
    const extract = LoadOsmLayerUseCase.prototype.exec;
    vi.spyOn(LoadOsmLayerUseCase.prototype, 'exec').mockImplementation(async function (this: LoadOsmLayerUseCase, params) {
      const result = await extract.call(this, params);
      events.push(`extracted:${params.layer}`);
      if (params.layer === 'buildings') {
        originalCrossingGeometry = (await conn.query(`SELECT ST_AsWKB(geometry) AS bytes FROM ${client.getCurrentWorkspace()}.${result.name} WHERE id=30`)).toArray()[0].bytes;
      }
      return result;
    });
    const clip = (client as any).clipLayerToLayer.bind(client);
    const filter = vi.spyOn(client as any, 'clipLayerToLayer').mockImplementation(async (...args: any[]) => {
      events.push('surface-filter');
      return clip(...args);
    });
    const result = await client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['buildings', 'surface'] } });
    expect(events).toEqual(['extracted:buildings', 'extracted:surface', 'surface-filter']);
    expect(filter).toHaveBeenCalledWith('table_osm_buildings', 'table_osm_surface', client.getCurrentWorkspace(), false);
    expect(result.layers.map(layer => layer.layerType)).toEqual(['buildings', 'surface']);
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features.map(feature => feature.id).sort()).toEqual([10, 30]); // 40 is removed by the actual polygon, 50 by PBF bbox filtering.
    expect(output.features.find(feature => feature.id === 10)?.properties?.parts).toHaveLength(2);
    const ws = client.getCurrentWorkspace();
    const crossing = (await conn.query(`SELECT ST_Within(b.geometry,s.geometry) AS inside FROM ${ws}.table_osm_buildings b,
      ${ws}.table_osm_surface s WHERE b.id=30`)).toArray()[0];
    expect(crossing.inside).toBe(false); // Buildings intersecting the surface remain whole, by contract.
    expect((await conn.query(`SELECT ST_AsWKB(geometry) AS bytes FROM ${ws}.table_osm_buildings WHERE id=30`)).toArray()[0].bytes)
      .toEqual(originalCrossingGeometry);
    expect(output.features.find(feature => feature.id === 30)?.properties?.parts).toEqual([
      expect.objectContaining({ id: 30, geometryIndex: 0, height: '8' }),
    ]);
  });

  it('13. exports stable feature IDs, indexed parts and heights after surface filtering', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    await client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } });
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features.map(feature => feature.id).sort()).toEqual([10, 30]);
    for (const feature of output.features) {
      expect(feature.geometry?.type).toBe('GeometryCollection');
      if (feature.geometry?.type !== 'GeometryCollection') throw new Error('Expected canonical building collection');
      expect(feature.geometry.geometries).toHaveLength(feature.properties!.parts.length);
      expect(feature.properties!.parts.map((part: any) => part.geometryIndex)).toEqual(feature.geometry.geometries.map((_, i) => i));
    }
    const building = output.features.find(feature => feature.id === 10)!;
    expect(building.geometry).toMatchObject({ type: 'GeometryCollection', geometries: [expect.any(Object), expect.any(Object)] });
    expect(building.properties?.parts.map((part: any) => [part.id, part.geometryIndex, part.height])).toEqual([[10, 0, '12'], [20, 1, '25']]);
    expect(await client.getTable('table_osm_buildings')).toHaveLength(2);
    expect(client.getTablesMetadata().find(table => table.name === 'table_osm_buildings')?.columns.some(column => column.name === 'agg_geometry')).toBe(false);
  });

  it('14. removes raw staging tables from DuckDB and the registry on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    await client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } });
    const ws = client.getCurrentWorkspace();
    const physicalTables = (await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${ws}'`)).toArray().map(row => row.table_name);
    expect(physicalTables).toContain('table_osm_buildings');
    expect(physicalTables).toContain('table_osm_surface');
    expect(physicalTables).not.toContain('table_osm');
    expect(physicalTables).not.toContain('table_osm_boundaries');
    expect(client.getTablesMetadata().map(table => table.name).sort()).toEqual(['table_osm_buildings', 'table_osm_surface']);
  });

  it('imports a valid building relation as one feature with only its two original parts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(realPbf)));
    await client.loadOsm({ pbfFileUrl: '/continental.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } });
    const output = await client.getLayer('table_osm_buildings');
    expect(output.features).toHaveLength(1);
    expect(output.features[0].geometry).toMatchObject({ type: 'GeometryCollection', geometries: [expect.any(Object), expect.any(Object)] });
    expect(output.features[0].id).toBe(68312552);
    expect(output.features[0].properties?.name).toBe('Continental Center');
    expect(output.features[0].properties?.osmRelation).toMatchObject({ id: '2100893',
      members: [{ id: '68312552', role: '' }, { id: '156973723', role: '' }] });
    expect(output.features[0].properties?.parts.map((part: any) => [part.id, part.geometryIndex]))
      .toEqual([[68312552, 0], [156973723, 1]]);
    expect(output.features[0].properties?.parts.map((part: any) => part.height).sort()).toEqual(
      continentalElements.filter(element => element.type === 'way').map(element => element.tags?.height).sort(),
    );
  });

  it('removes raw staging tables when extraction throws, preserving the original error and final layers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const error = new Error('Injected consolidation failure');
    vi.spyOn(ProcessOsmBuildingsUseCase.prototype, 'exec').mockRejectedValueOnce(error);
    const filter = vi.spyOn(client as any, 'clipLayerToLayer');
    await expect(client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } })).rejects.toBe(error);
    expect(filter).not.toHaveBeenCalled();
    expect(client.getLayersMetadata().map(table => table.name)).toEqual(['table_osm_surface']);
    const ws = client.getCurrentWorkspace();
    const raw = (await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${ws}'
      AND table_name IN ('table_osm','table_osm_boundaries')`)).toArray();
    expect(raw).toEqual([]);
    expect(client.getTablesMetadata().some(table => table.name === 'table_osm' || table.name === 'table_osm_boundaries')).toBe(false);
  });

  it.each(['bbox', 'surface-filter'])('cleans raw staging when %s processing fails', async stage => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const error = new Error(`Injected ${stage} failure`);
    if (stage === 'bbox') {
      vi.spyOn((client as any).getOsmBboxUseCase, 'exec').mockRejectedValueOnce(error);
    } else {
      vi.spyOn(client as any, 'clipLayerToLayer').mockRejectedValueOnce(error);
    }
    await expect(client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } })).rejects.toBe(error);
    const ws = client.getCurrentWorkspace();
    expect((await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${ws}'
      AND table_name IN ('table_osm','table_osm_boundaries')`)).toArray()).toEqual([]);
    expect(client.getTablesMetadata().some(table => table.name === 'table_osm' || table.name === 'table_osm_boundaries')).toBe(false);
    expect(client.getLayersMetadata()).toHaveLength(stage === 'bbox' ? 0 : 2);
  });

  it('warns on failed staging removal, retains its metadata and still cleans other staging tables', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(pbf)));
    const drop = (client as any).dropTableUseCase;
    const exec = drop.exec.bind(drop);
    vi.spyOn(drop, 'exec').mockImplementation(async (params: any) => params.tableName === 'table_osm'
      ? { success: false, message: 'Injected DROP failure' } : exec(params));
    const error = new Error('Injected consolidation failure');
    vi.spyOn(ProcessOsmBuildingsUseCase.prototype, 'exec').mockRejectedValueOnce(error);
    await expect(client.loadOsm({ pbfFileUrl: '/fixture.pbf', queryArea: { geocodeArea: 'Fixture', areas: ['Test District'] },
      autoLoadLayers: { layers: ['surface', 'buildings'] } })).rejects.toBe(error);
    const ws = client.getCurrentWorkspace();
    const raw = (await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${ws}'
      AND table_name IN ('table_osm','table_osm_boundaries')`)).toArray();
    expect(raw.map(row => row.table_name)).toEqual(['table_osm']);
    expect(client.getTablesMetadata().some(table => table.name === 'table_osm')).toBe(true);
    expect(client.getTablesMetadata().some(table => table.name === 'table_osm_boundaries')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Injected DROP failure'));
  });
});
