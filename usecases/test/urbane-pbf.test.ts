import { readFile } from 'node:fs/promises';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { expect, it, vi } from 'vitest';
import { loadDb } from '../../autk-db/src/duckdb-node';
import { MANHATTAN_AREA, MANHATTAN_PBF } from '../src/urbane/config';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../../autk-db/src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../../autk-db/src/db';

// Full-borough PBF processing shares CI resources with the other real-city imports.
it('loads administrative Manhattan without region fallback or layers from neighboring boroughs', async () => {
    native.db = await loadDb();
    const db = new AutkDb();
    const bytes = await readFile(new URL(`../public/data/${MANHATTAN_PBF}`, import.meta.url));
    // Canonical borough geometry exported from OSM relation 8398124 during PBF generation.
    const boundary = JSON.parse(await readFile(new URL('./fixtures/manhattan-administrative.geojson', import.meta.url), 'utf8'));
    vi.stubGlobal('self', globalThis);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(bytes)));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        await db.init();
        await db.loadOsm({
            pbfFileUrl: `/data/${MANHATTAN_PBF}`,
            queryArea: MANHATTAN_AREA,
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
        });
        expect(warn.mock.calls.some(([message]) => String(message).includes('falling back to exact area names'))).toBe(false);
        expect(warn.mock.calls.some(([message]) => /Cannot reconstruct coastline|No coastline available/.test(String(message)))).toBe(false);
        const { coordinateFormat, precisionGrid } = db.getWorkspaceConfiguration();
        const geometry = JSON.stringify(boundary.geometry).replace(/'/g, "''");
        for (const layer of ['surface', 'parks', 'water', 'roads', 'buildings']) {
            const collection = await db.getLayer(`table_osm_${layer}`);
            expect(collection.features.length, layer).toBeGreaterThan(0);
            if (['surface', 'parks', 'water'].includes(layer)) {
                expect(collection.features.every(({ geometry }) =>
                    geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'
                ), `${layer} must not contain linear clipping remnants that get filled by the renderer`).toBe(true);
            }
            // Roads/areas are clipped; surviving building parts remain uncut
            // and must be fully contained in the borough.
            const predicate = 'ST_CoveredBy';
            const rows = await db.rawQuery<Array<{ outside: number }>>({
                query: `WITH scope AS (
                    SELECT ST_Buffer(ST_Transform(ST_GeomFromGeoJSON('${geometry}'),
                        'EPSG:4326', '${coordinateFormat}', always_xy := true), ${precisionGrid * 3}) AS geometry
                ) SELECT COUNT(*) AS outside FROM table_osm_${layer}, scope
                  WHERE NOT ${predicate}(table_osm_${layer}.geometry, scope.geometry)
                    AND COALESCE(CAST(table_osm_${layer}.properties AS JSON)->>'generated', '') <> 'coastline'`,
                output: { type: 'RETURN_OBJECT' },
            });
            expect((rows as Array<{ outside: number }>)[0].outside, `${layer} outside the borough`).toBe(0);
        }
        const land = await db.rawQuery<Array<{ name: string; covered: boolean }>>({
            query: `WITH probes(name, lon, lat) AS (VALUES
                ('Roosevelt Island south', -73.9602, 40.7516), ('Randalls Island south', -73.928, 40.787),
                ('Liberty Island', -74.0445, 40.6893), ('Ellis Island', -74.0394, 40.6994),
                ('Marble Hill', -73.9103, 40.8766))
                SELECT probes.name, EXISTS (
                    SELECT 1 FROM table_osm_water
                    WHERE ST_Covers(geometry, ST_Transform(ST_Point(lon, lat),
                        'EPSG:4326', '${coordinateFormat}', always_xy := true))
                ) AS covered FROM probes`,
            output: { type: 'RETURN_OBJECT' },
        });
        for (const probe of land as Array<{ name: string; covered: boolean }>) {
            expect(probe.covered, `${probe.name} must remain land`).toBe(false);
        }
        // Lower Hudson water was reference-complete but had an unclosed ring in
        // the old extract, leaving this point inside Manhattan's scope unpainted.
        const coverage = await db.rawQuery<Array<{ covered: boolean }>>({
            query: `SELECT EXISTS (
                SELECT 1 FROM table_osm_water
                WHERE ST_Covers(geometry, ST_Transform(ST_Point(-74.014, 40.745),
                    'EPSG:4326', '${coordinateFormat}', always_xy := true))
            ) AS covered`,
            output: { type: 'RETURN_OBJECT' },
        });
        expect((coverage as Array<{ covered: boolean }>)[0].covered, 'Lower Hudson water coverage').toBe(true);
        const context = await db.rawQuery<Array<{ name: string; covered: boolean }>>({
            query: `WITH probes(name, lon, lat) AS (VALUES
                ('Liberty Island east', -74.0425, 40.6895), ('Liberty Island south', -74.0445, 40.6881),
                ('Ellis Island east', -74.0375, 40.6993))
                SELECT probes.name, EXISTS (
                    SELECT 1 FROM table_osm_water
                    WHERE CAST(properties AS JSON)->>'generated' = 'coastline'
                      AND ST_Covers(geometry, ST_Transform(ST_Point(lon, lat),
                        'EPSG:4326', '${coordinateFormat}', always_xy := true))
                ) AS covered FROM probes`,
            output: { type: 'RETURN_OBJECT' },
        });
        for (const probe of context as Array<{ name: string; covered: boolean }>) {
            expect(probe.covered, `${probe.name} must have coastal water context`).toBe(true);
        }
        const bounds = await db.rawQuery<Array<{ outside: number }>>({
            query: `WITH extent AS (
                SELECT ST_Buffer(ST_Envelope(ST_Transform(ST_GeomFromGeoJSON('${geometry}'),
                    'EPSG:4326', '${coordinateFormat}', always_xy := true)), ${precisionGrid * 3}) AS geometry
            ) SELECT COUNT(*) AS outside FROM table_osm_water, extent
              WHERE NOT ST_CoveredBy(table_osm_water.geometry, extent.geometry)`,
            output: { type: 'RETURN_OBJECT' },
        });
        expect((bounds as Array<{ outside: number }>)[0].outside, 'All water is limited to the areas bbox').toBe(0);
    } finally {
        await (db as unknown as { conn?: { close(): Promise<void> } }).conn?.close();
        await native.db?.terminate();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    }
}, 600_000);
