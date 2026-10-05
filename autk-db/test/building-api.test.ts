import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { FeatureCollection } from 'geojson';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({
  loadDb: async () => {
    const { loadDb } = await import('../src/duckdb-node');
    const engine = await loadDb();
    engines.push(engine);
    return engine;
  },
}));

import { AutkDb } from '../src/db';
import { DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../src/consts';

let db: AutkDb;

beforeAll(async () => {
  // Browser HTTP cache initialization still needs `self` when hosted in Node.
  vi.stubGlobal('self', globalThis);
  db = new AutkDb();
  await db.init();
}, 120_000);

afterAll(async () => {
  for (const engine of engines) await engine.terminate();
  vi.unstubAllGlobals();
});

const buildings: FeatureCollection = { type: 'FeatureCollection', features: [{
  type: 'Feature', id: 'building-a',
  geometry: { type: 'GeometryCollection', geometries: [
    { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[5, 0], [15, 0], [15, 10], [5, 10], [5, 0]]] },
  ] },
  properties: { height: 12, parts: [{ geometryIndex: 1, height: 25 }] },
}] };

// Exercises the real public API, workspace constraints and registry, without browser/GPU.
describe('public building feature API', () => {
  it('keeps one stored/exported building and reports counts 8 and 1 in opposite directions', async () => {
    await db.setWorkspace('matches');
    await db.loadGeojson({ geojsonObject: buildings, outputTableName: 'buildings', layerType: 'buildings',
      coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT });
    const points: FeatureCollection = { type: 'FeatureCollection', features: Array.from({ length: 8 }, (_, i) => ({
      type: 'Feature', id: `point-${i}`, geometry: { type: 'Point', coordinates: [i < 3 ? 2 : 12, 5] }, properties: {},
    })) };
    await db.loadGeojson({ geojsonObject: points, outputTableName: 'points', layerType: 'points',
      coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT });
    await db.spatialQuery({ tableRootName: 'buildings', tableJoinName: 'points', groupBy: [{ column: '*', aggregateFn: 'count' }] });
    const output = await db.getLayer('buildings');
    expect(output.features).toHaveLength(1);
    expect(output.features[0].id).toBe('building-a');
    expect(output.features[0].geometry).toEqual(buildings.features[0].geometry);
    expect(output.features[0].properties?.sjoin.count.points).toBe(8);
    expect(output.features[0].properties?.parts).toEqual([{ geometryIndex: 1, height: 25 }]);
    expect(await db.getTable('buildings')).toHaveLength(1);
    expect(db.getTablesMetadata().find(table => table.name === 'buildings')?.columns.some(column => column.name === 'agg_geometry')).toBe(false);

    await db.loadGeojson({ outputTableName: 'overlap', layerType: 'points', coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      geojsonObject: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'overlap-point',
        geometry: { type: 'Point', coordinates: [7, 5] }, properties: {} }] } });
    await db.spatialQuery({ tableRootName: 'overlap', tableJoinName: 'buildings', groupBy: [{ column: '*', aggregateFn: 'count' }] });
    expect((await db.getLayer('overlap')).features[0].properties?.sjoin.count.buildings).toBe(1);
  });

  it('accepts an empty filtered building layer without making it the workspace crop mask', async () => {
    await db.setWorkspace('empty');
    const empty = await db.loadGeojson({
      outputTableName: 'empty', geojsonObject: buildings, coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      layerType: 'buildings', boundingBox: { minLon: 100, minLat: 100, maxLon: 101, maxLat: 101 },
    });
    expect(empty.boundingBox).toBeUndefined();
    expect((await db.getLayer('empty')).features).toEqual([]);
    await db.loadGeojson({
      outputTableName: 'first_nonempty', coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      geojsonObject: { type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [4, 5] },
      }] },
    });
    await db.loadGeojson({ outputTableName: 'buildings', geojsonObject: buildings, coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT, layerType: 'buildings' });
    expect((await db.getLayer('buildings')).features).toHaveLength(1);
    expect((await db.getLayer('buildings')).features[0].geometry).toEqual(buildings.features[0].geometry);
  });

  it('updates by public ID, preserves indexed attributes and does not multiply features after repeated joins', async () => {
    await db.setWorkspace('updates');
    await db.loadGeojson({ geojsonObject: buildings, outputTableName: 'buildings', layerType: 'buildings',
      coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT });
    const input = structuredClone(buildings);
    input.features[0].properties = { height: 20, parts: [{ geometryIndex: 1, height: 35 }] };
    await db.updateTable({ tableName: 'buildings', strategy: 'update', idColumn: 'geojson_id', data: input });
    const output = await db.getLayer('buildings');
    expect(output.features[0].id).toBe('building-a');
    expect(output.features[0].properties?.parts).toEqual([{ geometryIndex: 1, height: 35 }]);
    expect(output.features[0].geometry).toEqual(buildings.features[0].geometry);

    await db.loadGeojson({ outputTableName: 'points', layerType: 'points', coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      geojsonObject: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 42,
        geometry: { type: 'Point', coordinates: [7, 5] }, properties: { value: 3 } }] } });
    for (let i = 0; i < 2; i++) await db.spatialQuery({ tableRootName: 'buildings', tableJoinName: 'points' });
    const joined = await db.getLayer('buildings');
    expect(joined.features).toHaveLength(1);
    expect(joined.features[0].properties?.sjoin.matches).toEqual([{ id: 42, properties: { value: 3 } }]);
    expect(joined.features[0].properties?.parts).toEqual([{ geometryIndex: 1, height: 35 }]);
    expect(await db.getTable('buildings')).toHaveLength(1);
  });
});
