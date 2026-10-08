import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';
import { resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import type { OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';
import { encodeBuildingPbf } from './fixtures/building-pipeline';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({ loadDb: async () => {
  const { loadDb } = await import('../src/duckdb-node');
  const engine = await loadDb(); engines.push(engine); return engine;
} }));
import { AutkDb } from '../src/db';

let db: AutkDb;
let serial = 0;
const fixture: OsmElement[] = [];
function way(id: number, coordinates: number[][], tags: Record<string, string>) {
  const nodes = coordinates.map((_, i) => id * 100 + i);
  fixture.push({ type: 'way', id, nodes: [...nodes, ...(coordinates.length > 2 ? [nodes[0]] : [])], tags },
    ...coordinates.map(([lon, lat], i) => ({ type: 'node' as const, id: nodes[i], lon, lat })));
}
for (const [id, x, y, tags] of [
  [201, 1, 1, { building: 'house', height: '10', name: 'NaN', id: 'own-tag', geometryIndex: 'own-tag', building_id: 'own-tag' }],
  [202, 2, 1, { building: 'house', height: '15' }],
  [301, 5, 1, { building: 'house', height: '13' }],
  [401, 5, 5, {}], [402, 7, 5, {}],
  [501, 8, 1, { building: 'yes', height: '20' }], [502, 8, 3, { 'building:part': 'yes' }],
  [601, 1, 6, { leisure: 'park', osm_type: 'tag', osm_id: 'tag' }], [611, 3, 6, {}], [612, 5, 7, {}],
] as Array<[number, number, number, Record<string, string>]>) {
  way(id, [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], tags);
}
way(203, [[3, 1], [4, 2], [3, 2], [4, 1]], { building: 'house' }); // Invalid bow tie must stay omitted.
way(701, [[-1, 4], [11, 4]], { highway: 'residential' });
fixture.push(
  { type: 'relation', id: 301, tags: { type: 'multipolygon', building: 'yes', height: '14' }, members: [401, 402].map(ref => ({ type: 'way', ref, role: 'outer' })) },
  { type: 'relation', id: 601, tags: { type: 'multipolygon', leisure: 'park' }, members: [611, 612].map(ref => ({ type: 'way', ref, role: 'outer' })) },
  { type: 'relation', id: 900, tags: { type: 'building', height: '30', name: 'Parent' }, members: [501, 502].map(ref => ({ type: 'way', ref, role: 'part' })) },
);

beforeAll(async () => { vi.stubGlobal('self', globalThis); db = new AutkDb(); await db.init(); }, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { for (const engine of engines) await engine.terminate(); vi.unstubAllGlobals(); });

describe('OSM element export (#108)', () => {
  it.each(['api', 'pbf'])('exports typed elements with own tags and indexed normalized geometry through %s', async source => {
    await db.setWorkspace(`osm_elements_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    if (source === 'pbf') {
      const bytes = await encodeBuildingPbf(fixture);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    } else {
      const elements = structuredClone(fixture); resolveWayGeometries(elements);
      vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements });
    }
    await db.loadOsm({ queryArea: { bbox: [0, 0, 10, 10] }, ...(source === 'pbf' ? { pbfFileUrl: '/elements.pbf' } : {}),
      autoLoadLayers: { layers: ['buildings', 'parks', 'roads'] } });
    const normal = await db.getLayer('table_osm_buildings');
    const elements = await db.getLayer('table_osm_buildings', { osmElements: true });
    expect(elements.features.map(feature => feature.id)).toEqual(['relation/301', 'way/201', 'way/202', 'way/301', 'way/501', 'way/502']);
    expect(await db.getLayer('table_osm_buildings', { osmElements: true })).toEqual(elements);
    expect(normal.features).toHaveLength(4);
    const first = elements.features.find(feature => feature.id === 'way/201')!;
    const second = elements.features.find(feature => feature.id === 'way/202')!;
    expect(first.properties).toMatchObject({ osm_type: 'way', osm_id: 201, building_id: 201, height: '10', name: 'NaN', id: 'own-tag', geometryIndex: 'own-tag' });
    expect(second.properties).toMatchObject({ building_id: 201, height: '15' });
    expect(elements.features.find(feature => feature.id === 'relation/301')?.geometry.type).toBe('MultiPolygon');
    const member = elements.features.find(feature => feature.id === 'way/502')!;
    expect(member.properties).not.toHaveProperty('height');
    expect(member.properties).not.toHaveProperty('name');
    expect(member.properties).not.toHaveProperty('osmRelation');
    expect(normal.features.find(feature => feature.properties?.osmRelation)?.properties).toMatchObject({ height: '30', name: 'Parent' });
    for (const feature of elements.features) {
      const building = normal.features.find(parent => parent.properties?.building_id === feature.properties?.building_id)!;
      const part = building.properties!.parts.find((part: any) => part.id === feature.properties?.osm_id
        && building.geometry.type === 'GeometryCollection' && JSON.stringify(building.geometry.geometries[part.geometryIndex]) === JSON.stringify(feature.geometry));
      expect(part).toBeDefined();
      expect(feature.properties).not.toHaveProperty('parts');
      expect(feature.properties).not.toHaveProperty('__autk_layer');
      expect(feature.properties).not.toHaveProperty('__autk_osm_elements');
    }
    expect(await db.getLayer('table_osm_buildings')).toEqual(normal);
    expect(elements.bbox).toEqual(normal.bbox);
    expect((elements as any).__autk_layer).toBe('buildings');
    const parks = await db.getLayer('table_osm_parks', { osmElements: true });
    expect(parks.features.map(feature => feature.id)).toEqual(['relation/601', 'way/601']);
    expect(parks.features.find(feature => feature.id === 'way/601')?.properties).toMatchObject({ osm_type: 'way', osm_id: 601, leisure: 'park' });
    const roads = await db.getLayer('table_osm_roads', { osmElements: true });
    expect(roads.features[0]).toMatchObject({ id: 'way/701', geometry: { type: 'LineString', coordinates: [[-1, 4], [11, 4]] } });
    expect(await db.getLayer('table_osm_surface', { osmElements: true })).toEqual(await db.getLayer('table_osm_surface'));
    await db.rawQuery({ query: 'SELECT id, geometry, properties FROM table_osm_parks', output: { type: 'CREATE_TABLE', tableName: 'derived', tableType: 'parks', source: 'osm' } });
    expect(await db.getLayer('derived', { osmElements: true })).toEqual(await db.getLayer('derived'));
    await db.rawQuery({ query: 'SELECT geometry, properties, __autk_osm_elements FROM table_osm_buildings',
      output: { type: 'CREATE_TABLE', tableName: 'without_building_id', tableType: 'buildings', source: 'osm' } });
    expect(await db.getLayer('without_building_id', { osmElements: true })).toEqual(await db.getLayer('without_building_id'));
    await db.updateTable({ tableName: 'table_osm_buildings', data: normal, strategy: 'update', idColumn: 'id' });
    expect(await db.getLayer('table_osm_buildings', { osmElements: true })).toEqual(await db.getLayer('table_osm_buildings'));
    await db.loadOsm({ queryArea: { bbox: [0, 0, 10, 10] }, ...(source === 'pbf' ? { pbfFileUrl: '/elements.pbf' } : {}),
      autoLoadLayers: { layers: ['buildings', 'parks', 'roads'] } });
    expect(await db.getLayer('table_osm_buildings', { osmElements: true })).toEqual(elements);
  });

  it('does not treat an unrelated multipolygon as a missing way with the same number', async () => {
    await db.setWorkspace(`osm_missing_way_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
    const elements = structuredClone(fixture).filter(element => !(element.type === 'way' && element.id === 301));
    elements.push({ type: 'relation', id: 901, tags: { type: 'building', name: 'Missing way' }, members: [{ type: 'way', ref: 301, role: 'part' }] });
    resolveWayGeometries(elements);
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadOsm({ queryArea: { bbox: [0, 0, 10, 10] }, autoLoadLayers: { layers: ['buildings'] } });
    const output = await db.getLayer('table_osm_buildings', { osmElements: true });
    expect(output.features.find(feature => feature.id === 'relation/301')?.properties?.height).toBe('14');
    expect(output.features.some(feature => feature.id === 'way/301')).toBe(false);
    expect((await db.getLayer('table_osm_buildings')).features.some(feature => feature.properties?.osmRelation?.id === '901')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building relation 901.*ways 301/));
  });

  it('leaves GeoJSON layers unchanged and handles empty OSM layers', async () => {
    await db.setWorkspace(`osm_empty_${++serial}`);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(LoadOsmFromOverpassApiUseCase.prototype as any, 'fetchCombinedOsmData').mockResolvedValue({ elements: [] });
    await db.loadOsm({ queryArea: { bbox: [0, 0, 1, 1] }, autoLoadLayers: { layers: ['buildings', 'parks'] } });
    for (const layer of ['buildings', 'parks']) expect((await db.getLayer(`table_osm_${layer}`, { osmElements: true })).features).toEqual([]);
    await db.setWorkspace(`non_osm_${++serial}`);
    await db.loadGeojson({ outputTableName: 'buildings', layerType: 'buildings', geojsonObject: { type: 'FeatureCollection', features: [
      { type: 'Feature', id: 'local', properties: { osm_type: 'way', osm_id: 1 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    ] } });
    expect(await db.getLayer('buildings', { osmElements: true })).toEqual(await db.getLayer('buildings'));
    await db.rawQuery({ query: `SELECT ST_Point(1, 1) geometry, '{"value":5}'::JSON properties`,
      output: { type: 'CREATE_TABLE', tableName: 'raster', tableType: 'raster', source: 'osm' } });
    expect(await db.getLayer('raster', { osmElements: true })).toEqual(await db.getLayer('raster'));
  });
});
