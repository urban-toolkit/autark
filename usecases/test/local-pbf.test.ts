import { readFile } from 'node:fs/promises';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { loadDb } from '../../autk-db/src/duckdb-node';
import { BAND_COUNT, NITEROI_AREA, NITEROI_PBF } from '../src/niteroi/config';
import { CHICAGO_AREA, CHICAGO_PBF } from '../src/shadows/config';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../../autk-db/src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../../autk-db/src/db';

let db: AutkDb;
beforeAll(async () => {
    native.db = await loadDb();
    vi.stubGlobal('self', globalThis);
    db = new AutkDb();
    await db.init();
}, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
    await (db as unknown as { conn?: { close(): Promise<void> } }).conn?.close();
    await native.db?.terminate();
    vi.unstubAllGlobals();
});

it.each([
    { name: 'niteroi', file: NITEROI_PBF, area: NITEROI_AREA, layers: ['surface', 'parks', 'water', 'roads'] as const },
    { name: 'shadows', file: CHICAGO_PBF, area: CHICAGO_AREA, layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as const },
])('loads $name from the bundled PBF without any Overpass/OSM requests', async ({ name, file, area, layers }) => {
    await db.setWorkspace(name);
    const bytes = await readFile(new URL(`../public/data/${file}`, import.meta.url));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (String(url) !== `/data/${file}`) throw new Error(`Unexpected remote request: ${String(url)}`);
        return new Response(new Uint8Array(bytes));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadOsm({ queryArea: area, pbfFileUrl: `/data/${file}`, autoLoadLayers: { layers: [...layers] } });
    expect(fetch).toHaveBeenCalled();
    expect(warn.mock.calls.some(([message]) => /falling back to exact area names|No complete geocode boundary/.test(String(message)))).toBe(false);
    expect(db.getLayersMetadata().map(layer => layer.type)).toEqual(layers);
    for (const layer of layers) {
        const collection = await db.getLayer(`table_osm_${layer}`);
        expect(collection.features.length, `${name}/${layer}`).toBeGreaterThan(0);
        if (['surface', 'parks', 'water'].includes(layer)) {
            expect(collection.features.every(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))).toBe(true);
        }
    }
    const water = await db.getLayer('table_osm_water');
    if (name === 'niteroi') {
        expect(warn.mock.calls.some(([message]) => /Cannot reconstruct coastline|No coastline available/.test(String(message)))).toBe(false);
        expect(water.features.some(feature => feature.properties?.generated === 'coastline')).toBe(true);
        const rasterBytes = await readFile(new URL('../public/data/niteroi_lst_verao_2001_2024.tif', import.meta.url));
        const roadsBefore = await db.getLayer('table_osm_roads');
        const raster = await db.loadGeoTiff({ outputTableName: 'lst', geotiffArrayBuffer: new Uint8Array(rasterBytes).buffer });
        expect(raster.bands).toHaveLength(BAND_COUNT);
        await db.spatialQuery({ tableRootName: 'table_osm_roads', tableJoinName: 'lst', near: { distance: 1000 },
            groupBy: Array.from({ length: BAND_COUNT }, (_, i) => ({ column: `band_${i + 1}`, aggregateFn: 'avg' as const })) });
        const roads = await db.getLayer('table_osm_roads');
        expect(roads.features).toHaveLength(roadsBefore.features.length);
        expect(roads.features.some(feature => feature.properties?.sjoin?.avg?.['lst.band_1'] > 0)).toBe(true);
        const bands = Array.from({ length: BAND_COUNT }, (_, i) =>
            `COALESCE(json_extract(properties, '$.sjoin.avg."lst.band_${i + 1}"')::DOUBLE, 0)`);
        await db.rawQuery({ query: `SELECT geometry, json_merge_patch(properties, json_object('lst_timeseries', [${bands.join(', ')}])) properties FROM table_osm_roads`,
            output: { type: 'CREATE_TABLE', tableName: 'table_osm_roads', source: 'osm', tableType: 'roads' } });
        const series = (await db.getLayer('table_osm_roads')).features.map(feature => feature.properties?.lst_timeseries);
        expect(series.every(values => values.length === BAND_COUNT && values.every(Number.isFinite))).toBe(true);
        expect(series.some(values => values.some((value: number) => value > 0))).toBe(true);
    } else {
        // Lake Michigan is explicit natural=water, not a marine natural=coastline network.
        expect(water.features.every(feature => feature.properties?.generated !== 'coastline')).toBe(true);
        expect(warn.mock.calls.some(([message]) => /No coastline available/.test(String(message)))).toBe(true);
        const query = await readFile(new URL('../src/shadows/split-roads.sql', import.meta.url), 'utf8');
        await db.rawQuery({ query, output: { type: 'CREATE_TABLE', tableName: 'table_roads_20m', source: 'user', tableType: 'roads' } });
        const rows = await db.rawQuery({ query: `SELECT COUNT(*) n, COUNT(DISTINCT geojson_id) unique_ids FROM table_roads_20m`,
            output: { type: 'RETURN_OBJECT' } });
        expect(Number(rows[0].n)).toBeGreaterThan(0);
        expect(Number(rows[0].unique_ids)).toBe(Number(rows[0].n));
    }
}, 600_000);
