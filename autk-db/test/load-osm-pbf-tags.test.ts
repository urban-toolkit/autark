import { readFileSync } from 'node:fs';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { booleanPointInPolygon } from '@turf/turf';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OsmElement, OsmQueryArea, OsmTagSet } from '../src/use-cases/load-osm-overpass/interfaces';
import { resolveWayGeometries } from '../src/use-cases/load-osm-pbf/osm-pbf-parser';
import { encodeBuildingPbf } from './fixtures/building-pipeline';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({ loadDb: async () => {
  const { loadDb } = await import('../src/duckdb-node');
  const engine = await loadDb(); engines.push(engine); return engine;
} }));
import { AutkDb } from '../src/db';

let db: AutkDb;
let serial = 0;
const bbox: [number, number, number, number] = [0, 0, 10, 10];
const fixture: OsmElement[] = [
  { type: 'relation', id: 90, tags: { name: 'Fixture', boundary: 'administrative', type: 'boundary' }, members: [{ type: 'way', ref: 80, role: 'outer' }] },
  { type: 'relation', id: 91, tags: { name: 'District', boundary: 'administrative', type: 'boundary' }, members: [{ type: 'way', ref: 80, role: 'outer' }] },
  { type: 'way', id: 80, nodes: [800, 801, 802, 800] },
  ...[[0, 0], [10, 0], [0, 10]].map(([lon, lat], i) => ({ type: 'node' as const, id: 800 + i, lon, lat })),
  { type: 'relation', id: 10, tags: { type: 'multipolygon', amenity: 'school' }, members: [{ type: 'way', ref: 11, role: 'outer' }, { type: 'way', ref: 12, role: 'outer' }] },
  { type: 'way', id: 11, nodes: [110, 111, 112, 113, 110] },
  ...[[1, 1], [2, 1], [2, 2], [1, 2]].map(([lon, lat], i) => ({ type: 'node' as const, id: 110 + i, lon, lat,
    ...(i === 0 ? { tags: { amenity: 'school', name: `Joe's "School"` } } : {}) })),
  { type: 'way', id: 12, nodes: [120, 121, 122, 123, 120] },
  ...[[20, 20], [21, 20], [21, 21], [20, 21]].map(([lon, lat], i) => ({ type: 'node' as const, id: 120 + i, lon, lat })),
  { type: 'node', id: 1, lon: 3, lat: 3, tags: { amenity: 'school' } },
  { type: 'node', id: 2, lon: 8, lat: 8, tags: { amenity: 'school' } },
  { type: 'node', id: 3, lon: 20, lat: 20, tags: { amenity: 'school' } },
  { type: 'node', id: 4, lon: 4, lat: 2, tags: { shop: 'bakery' } },
  { type: 'node', id: 5, lon: 5, lat: 2, tags: { amenity: 'cafe' } },
  { type: 'way', id: 20, tags: { highway: 'footway' }, nodes: [200, 201] },
  { type: 'node', id: 200, lon: -1, lat: 3 }, { type: 'node', id: 201, lon: 11, lat: 3 },
];

beforeAll(async () => { vi.stubGlobal('self', globalThis); db = new AutkDb(); await db.init(); }, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { for (const engine of engines) await engine.terminate(); vi.unstubAllGlobals(); });

async function load(source: 'pbf' | 'api', tagSets: OsmTagSet[], queryArea: OsmQueryArea = { bbox }, elements = fixture, layers: Array<'roads'> = ['roads']) {
  await db.setWorkspace(`pbf_tags_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
  const inline = structuredClone(elements);
  resolveWayGeometries(inline);
  const api = vi.spyOn((db as any).loadOsmFromOverpassApiUseCase, 'fetchCombinedOsmData').mockResolvedValue({ elements: inline }).mockClear();
  const bytes = await encodeBuildingPbf(elements);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input) !== '/fixture.osm.pbf') throw new Error(`Unexpected remote request: ${input}`);
    return new Response(new Uint8Array(bytes));
  }).mockClear();
  const result = await db.loadOsm({ queryArea, pbfFileUrl: source === 'pbf' ? '/fixture.osm.pbf' : undefined,
    autoLoadLayers: { layers }, tagSets });
  if (source === 'pbf') {
    expect(api).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls.every(([url]) => url === '/fixture.osm.pbf')).toBe(true);
  }
  return result;
}

const schools = (type: OsmTagSet['type']): OsmTagSet => ({ name: 'schools', type, tags: [{ key: 'amenity', value: 'school' }] });

describe('PBF tag-set acquisition', () => {
  it.each(['points', 'polygons', 'polylines'] as const)('matches API results for %s using the same public tagSets option', async type => {
    const set: OsmTagSet = type === 'polylines' ? { name: 'schools', type, tags: [{ key: 'highway' }] } : schools(type);
    await load('api', [set]);
    const expected = await db.getLayer(`table_osm_schools_${type}`, { osmElements: true });
    const timings = await load('pbf', [set]);
    const actual = await db.getLayer(`table_osm_schools_${type}`, { osmElements: true });
    expect(actual).toEqual(expected);
    expect(actual.features.length).toBeGreaterThan(0);
    expect(timings.layers.some(layer => layer.tagSet === 'schools' && layer.layerType === type)).toBe(true);
    expect(db.getTablesMetadata().map(table => table.name)).not.toContain('table_osm');
  });

  it('keeps standalone points and tagged way vertices once, without converting areas to points', async () => {
    await load('pbf', [schools('points')]);
    const result = await db.getLayer('table_osm_schools_points', { osmElements: true });
    expect(result.features.map(feature => feature.id).sort()).toEqual(['node/1', 'node/110', 'node/2']);
    expect(result.features.find(feature => feature.id === 'node/110')?.properties?.name).toBe(`Joe's "School"`);
  });

  it('supports tag-only PBF loads while retaining the internal surface mask', async () => {
    await load('pbf', [schools('points')], { bbox }, fixture, []);
    expect(db.getLayersMetadata().map(layer => layer.name)).toEqual(['table_osm_schools_points']);
    expect(db.getCurrentWorkspaceData().workspaceCropLayer).toBe('table_osm_surface');
  });

  it('keeps untagged multipolygon members and their referenced nodes before clipping', async () => {
    await load('pbf', [schools('polygons')]);
    const result = await db.getLayer('table_osm_schools_polygons', { osmElements: true });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe('relation/10');
    expect(result.features[0].geometry).toMatchObject({ type: 'Polygon' });
    expect((await db.getBoundingBoxFromLayer('table_osm_schools_polygons')).maxLon).toBe(2);
  });

  it('applies OR/presence filters, exact values, and named-region surface clipping locally', async () => {
    await load('pbf', [{ name: 'places', type: 'points', tags: [{ key: 'amenity', value: 'school' }, { key: 'shop' }] }],
      { geocodeArea: 'Fixture', areas: ['District'] });
    const result = await db.getLayer('table_osm_places_points', { osmElements: true });
    expect(result.features.map(feature => feature.id).sort()).toEqual(['node/1', 'node/110', 'node/4']);
    await load('pbf', [{ name: 'named', type: 'points', tags: [{ key: 'name', value: `Joe's "School"` }] }]);
    expect((await db.getLayer('table_osm_named_points', { osmElements: true })).features.map(feature => feature.id)).toEqual(['node/110']);
  });

  it('runs the three bundled Monaco queries locally, including cafes without buildings', async () => {
    const bytes = readFileSync(new URL('../../gallery/public/data/monaco.osm.pbf', import.meta.url));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      expect(String(input)).toBe('/monaco.osm.pbf');
      return new Response(new Uint8Array(bytes));
    });
    const api = vi.spyOn((db as any).loadOsmFromOverpassApiUseCase, 'fetchCombinedOsmData').mockRejectedValue(new Error('Unexpected Overpass call'));
    for (const mode of ['bbox', 'place', 'tags']) {
      await db.setWorkspace(`monaco_asset_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
      await db.loadOsm({
        pbfFileUrl: '/monaco.osm.pbf',
        queryArea: mode === 'bbox' ? { bbox: [7.405, 43.720, 7.445, 43.7525] }
          : { geocodeArea: 'Monaco', areas: ['Monaco'] },
        autoLoadLayers: { layers: mode === 'tags' ? ['surface', 'parks', 'water', 'roads']
          : ['surface', 'parks', 'water', 'roads', 'buildings'] },
        ...(mode === 'tags' ? { tagSets: [{ name: 'cafes', type: 'points' as const, tags: [{ key: 'amenity', value: 'cafe' }] }] } : {}),
      });
      const counts: Record<string, number> = {};
      for (const layer of db.getLayersMetadata()) counts[layer.name] = (await db.getLayer(layer.name)).features.length;
      expect(counts.table_osm_surface).toBeGreaterThan(0);
      expect(counts.table_osm_parks).toBeGreaterThan(0);
      expect(counts.table_osm_roads).toBeGreaterThan(0);
      if (mode === 'tags') {
        expect(counts.table_osm_buildings).toBeUndefined();
        expect(counts.table_osm_cafes_points).toBeGreaterThan(0);
        expect((await db.getBoundingBoxFromLayer('table_osm_cafes_points')).maxLat).toBeGreaterThan(43.74);
      } else {
        expect(counts.table_osm_buildings).toBeGreaterThan(0);
        expect((await db.getBoundingBoxFromLayer('table_osm_buildings')).maxLat).toBeGreaterThan(43.74);
      }

      const water = await db.getLayer('table_osm_water');
      expect(water.features.some(feature => feature.properties?.generated === 'coastline')).toBe(true);
      const waterBounds = await db.getBoundingBoxFromLayer('table_osm_water');
      expect(waterBounds.minLat).toBeGreaterThanOrEqual(43.72);
      expect(waterBounds.maxLon).toBeLessThanOrEqual(7.445);
      {
        const surface = await db.getLayer('table_osm_surface');
        const sea = [7.43, 43.73];
        for (const [collection, containsSea] of [[surface, false], [water, true]] as const) {
          expect(collection.features.some(({ geometry }) =>
            (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
              && booleanPointInPolygon(sea, geometry))).toBe(containsSea);
        }
      }
    }
    expect(fetch).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('clips custom nodes by the same coastal land mask as standard layers', async () => {
    const elements: OsmElement[] = [...fixture,
      { type: 'way', id: 30, tags: { natural: 'coastline' }, nodes: [300, 301] },
      { type: 'node', id: 300, lon: 2, lat: -1 }, { type: 'node', id: 301, lon: 2, lat: 11 },
    ];
    await load('pbf', [schools('points')], { bbox }, elements);
    expect((await db.getLayer('table_osm_schools_points', { osmElements: true })).features.map(feature => feature.id)).toEqual(['node/110']);
  });
});
