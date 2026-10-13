import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { valueAtPath } from '@urban-toolkit/autk-core';
import { runBinning1d } from '../../autk-plot/src/transforms/presets/binning-1d';
import { loadDb } from '../../autk-db/src/duckdb-node';
import splitRoadsQuery from '../src/shadows/split-roads.sql?raw';
import { MONTH_CONFIG, clearRoadsCompute } from '../src/shadows/utils';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../../autk-db/src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../../autk-db/src/db';

let db: AutkDb;
beforeAll(async () => {
    native.db = await loadDb();
    vi.stubGlobal('self', globalThis);
    db = new AutkDb(); await db.init();
}, 120_000);
afterAll(async () => {
    await (db as unknown as { conn?: { close(): Promise<void> } }).conn?.close();
    await native.db?.terminate(); vi.unstubAllGlobals();
});

it('resolves joined month attributes for plot binning, map and compute without changing Shadows data', async () => {
    await db.rawQuery({ query: `SELECT id, ST_GeomFromText(wkt) geometry FROM (VALUES
        (100,'LINESTRING(0 0,55 0)'), (200,'LINESTRING(1000 0,1055 0)')) AS roads(id,wkt)`,
        output: { type: 'CREATE_TABLE', tableName: 'table_osm_roads', tableType: 'roads' } });
    await db.rawQuery({ query: splitRoadsQuery,
        output: { type: 'CREATE_TABLE', tableName: 'roads', tableType: 'roads' } });
    const segments = await db.getLayer('roads');
    expect(segments.features).toHaveLength(6);
    const segmentIds = segments.features.map(feature => feature.id).sort();
    expect(segmentIds).toEqual([0, 1, 2].flatMap(index => [`road/100/segment/${index}`, `road/200/segment/${index}`]).sort());
    await db.rawQuery({ query: `SELECT ST_Point(x,0) geometry, jun, sep, dez FROM
        (VALUES (0,0,10,20), (1000,5,15,25)) AS samples(x,jun,sep,dez)`,
        output: { type: 'CREATE_TABLE', tableName: 'shadows', tableType: 'points' } });
    for (const { code } of MONTH_CONFIG) {
        await db.spatialQuery({ tableRootName: 'roads', tableJoinName: 'shadows', near: { distance: 200 },
            groupBy: [{ column: code, aggregateFn: 'avg' }] });
    }
    const roads = await db.getLayer('roads');
    expect(roads.features.map(feature => feature.id).sort()).toEqual(segmentIds);
    expect(new Set(roads.features.map(feature => feature.id)).size).toBe(roads.features.length);
    expect(roads.features.every(feature => feature.properties?.id === 100 || feature.properties?.id === 200)).toBe(true);
    clearRoadsCompute(roads);
    const rows = roads.features.map((feature, index) => ({ ...feature.properties, autkIds: [index] }));
    for (const { code } of MONTH_CONFIG) {
        const attribute = `sjoin.avg.shadows.${code}`;
        expect(rows.every(row => Number.isFinite(valueAtPath(row, attribute)))).toBe(true);
        for (const feature of roads.features) {
            expect(valueAtPath(feature, `properties.${attribute}`)).toBe(feature.properties?.sjoin.avg[`shadows.${code}`]);
        }
        const binned = runBinning1d(rows, { preset: 'binning-1d', options: { bins: 13 } }, [attribute]);
        expect(binned.rows).toHaveLength(2);
        expect(binned.rows.reduce((count, bin) => count + bin.value, 0)).toBe(6);
        expect(binned.rows.flatMap(bin => bin.autkIds).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
    expect(rows.map(row => valueAtPath(row, 'sjoin.avg.shadows.jun')).sort()).toEqual([0, 0, 0, 5, 5, 5]);
});
