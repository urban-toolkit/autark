import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { FeatureCollection } from 'geojson';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { loadDb } from '../../autk-db/src/duckdb-node';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../../autk-db/src/duckdb', () => ({ loadDb: async () => native.db }));
vi.mock('@urban-toolkit/autk-db', () => import('../../autk-db/src/db'));
import { UrbaneData } from '../src/urbane/data';

let data: UrbaneData;
let workspace = 0;

beforeAll(async () => {
    native.db = await loadDb();
    vi.stubGlobal('self', globalThis);
    data = new UrbaneData();
    await data.init();
}, 120_000);

afterAll(async () => {
    await (data?.db as unknown as { conn?: { close(): Promise<void> } })?.conn?.close();
    await native.db?.terminate();
    vi.unstubAllGlobals();
});

beforeEach(async () => {
    await data.db.setWorkspace(`urbane_drilldown_${++workspace}`, { coordinateFormat: 'EPSG:3395', precisionGrid: 0.01 });
    const neighborhoods: FeatureCollection = { type: 'FeatureCollection', features: ['Chelsea', "Hell's Kitchen", 'Midtown'].map((name, index) => {
        const x = index * 1000;
        return { type: 'Feature', id: index, properties: { ntaname: name },
            geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1000, 0], [x + 1000, 1000], [x, 1000], [x, 0]]] } };
    }) };
    const buildings: FeatureCollection = { type: 'FeatureCollection', features: [
        { name: 'west', x: 100 }, { name: 'east', x: 1200 }, { name: 'shared', x: 950 },
        { name: 'unmatched', x: 3200 }, { name: 'other', x: 2200 },
    ].map(({ name, x }, index) => ({ type: 'Feature', id: index + 100,
        properties: { name, height: 12, parts: [{ id: index + 100, geometryIndex: 0, height: 12 }] },
        geometry: { type: 'Polygon', coordinates: [[[x, 100], [x + 100, 100], [x + 100, 200], [x, 200], [x, 100]]] } })) };
    await data.db.loadGeojson({ outputTableName: 'surface', layerType: 'surface', coordinateFormat: 'EPSG:3395',
        geojsonObject: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [4000, 0], [4000, 1000], [0, 1000], [0, 0]]] } }] } });
    await data.db.loadGeojson({ outputTableName: 'neighborhoods', geojsonObject: neighborhoods, coordinateFormat: 'EPSG:3395' });
    await data.db.loadGeojson({ outputTableName: 'table_osm_buildings', geojsonObject: buildings,
        layerType: 'buildings', coordinateFormat: 'EPSG:3395' });
    await data.db.rawQuery({ query: 'SELECT *, id AS building_id FROM table_osm_buildings',
        output: { type: 'CREATE_TABLE', tableName: 'table_osm_buildings', source: 'osm', tableType: 'buildings' } });
    await data.db.spatialQuery({ tableRootName: 'table_osm_buildings', tableJoinName: 'neighborhoods' });
    await data.db.loadGeojson({ outputTableName: 'school', coordinateFormat: 'EPSG:3395', layerType: 'points',
        geojsonObject: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { key: 1 },
            geometry: { type: 'Point', coordinates: [150, 150] } }] } });
    await data.db.loadGeojson({ outputTableName: 'table_osm_roads', coordinateFormat: 'EPSG:3395', layerType: 'roads',
        geojsonObject: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { compute: { skyViewFactor: 0.8 } },
            geometry: { type: 'LineString', coordinates: [[100, 150], [200, 150]] } }] } });
});

it.each([
    { names: ['Chelsea'], expected: ['shared', 'west'] },
    { names: ["Hell's Kitchen"], expected: ['east', 'shared'] },
    { names: ['Chelsea', "Hell's Kitchen"], expected: ['east', 'shared', 'west'] },
    { names: ['Missing neighborhood'], expected: [] },
])('selects buildings from nested neighborhood matches for $names', async ({ names, expected }) => {
    const source = await data.getLayer('table_osm_buildings');
    expect(source.features.find(feature => feature.properties?.name === 'shared')?.properties?.sjoin.matches).toHaveLength(2);
    expect(source.features.find(feature => feature.properties?.name === 'unmatched')?.properties?.sjoin.matches).toEqual([]);
    const selected = await data.loadActiveBuildings(['school'], names, 300);
    expect(selected.features.map(feature => feature.properties?.name).sort()).toEqual(expected);
    for (const feature of selected.features) {
        expect(feature.geometry.type).toBe('GeometryCollection');
        expect(feature.properties?.parts).toHaveLength(1);
        const original = source.features.find(item => item.properties?.name === feature.properties?.name)!;
        expect(feature.properties?.parts).toEqual(original.properties?.parts);
        expect(Number.isFinite(feature.properties?.sjoin.count.school)).toBe(true);
    }
    const geometryChecks = await data.db.rawQuery<Array<{ unchanged: boolean }>>({
        query: `SELECT ST_Equals(active.geometry, original.geometry) AS unchanged
            FROM active_buildings active JOIN table_osm_buildings original
            ON (active.properties->>'name') = (original.properties->>'name')`,
        output: { type: 'RETURN_OBJECT' },
    });
    expect(geometryChecks).toHaveLength(expected.length);
    expect((geometryChecks as Array<{ unchanged: boolean }>).every(row => row.unchanged)).toBe(true);
    expect((await data.getLayer('active_buildings')).features).toEqual(selected.features);
    expect(await data.getLayer('table_osm_buildings')).toEqual(source);
});

it('populates building plot inputs and replaces the previous drill-down subset', async () => {
    const first = await data.loadActiveBuildings(['school'], ['Chelsea'], 300);
    const west = first.features.find(feature => feature.properties?.name === 'west')!;
    expect(west).toBeDefined();
    expect(west.properties?.sjoin.count.school).toBe(1);
    expect(west.properties?.sjoin.count.school_norm).toBe(1);
    expect(west.properties?.sjoin.avg['table_osm_roads.compute.skyViewFactor']).toBeCloseTo(0.8);
    const second = await data.loadActiveBuildings(['school'], ["Hell's Kitchen"], 300);
    expect(second.features.map(feature => feature.properties?.name).sort()).toEqual(['east', 'shared']);
});
