import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { FeatureCollection } from 'geojson';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { LoadGeojsonUseCase } from '../src/use-cases/load-geojson/use-case';
import { GetLayerUseCase } from '../src/use-cases/get-layer/use-case';
import { UpdateTableUseCase } from '../src/use-cases/update-table/use-case';

let db: AsyncDuckDB;
let conn: AsyncDuckDBConnection;

beforeAll(async () => {
  db = await loadDb();
  conn = await db.connect();
  await conn.query('INSTALL spatial; LOAD spatial; CREATE SCHEMA autk;');
}, 120_000);

afterAll(async () => {
  await conn?.close();
  await db?.terminate();
});

const collection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'building-a', properties: { height: 12, parts: [{ height: 25 }] },
      geometry: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }] } },
    { type: 'Feature', id: 42, properties: { height: 15 },
      geometry: { type: 'Polygon', coordinates: [[[5, 0], [15, 0], [15, 10], [5, 10], [5, 0]]] } },
  ],
};

async function load(geojsonObject: FeatureCollection, name = 'buildings') {
  return new LoadGeojsonUseCase(db, conn).exec({
    geojsonObject, outputTableName: name, layerType: 'buildings',
    coordinateFormat: 'EPSG:4326', workspaceCoordinateFormat: 'EPSG:4326',
  });
}

describe('building feature round-trip', () => {
  it.each([true, false])('reads buildings larger than 16 MiB while preserving geometry validation (valid=%s)', async valid => {
    await load(collection, 'large_buildings');
    const input = structuredClone(collection);
    input.features = [input.features[1]];
    input.features[0].properties = { height: 15, padding: 'x'.repeat(17 * 1024 * 1024) };
    if (!valid) input.features[0].geometry = { type: 'Polygon', coordinates: [[[0,0],[10,10],[0,10],[10,0],[0,0]]] };
    if (valid) {
      await load(input, 'large_buildings');
      const row = (await conn.query(`SELECT geojson_id, length(properties->>'padding') bytes,
        ST_IsValid(geometry) valid_geometry FROM autk.large_buildings`)).toArray()[0];
      expect(row.geojson_id).toBe('42');
      expect(row.bytes).toBe(17n * 1024n * 1024n);
      expect(row.valid_geometry).toBe(true);
    } else {
      await expect(load(input, 'large_buildings')).rejects.toThrow(/Building 42 has invalid geometry/);
      expect((await conn.query('SELECT COUNT(*) n FROM autk.large_buildings')).toArray()[0].n).toBe(2n);
    }
    expect((await conn.query(`SELECT COUNT(*) n FROM information_schema.tables
      WHERE table_schema='autk' AND table_name LIKE 'large_buildings_feature_collection_%'`)).toArray()[0].n).toBe(0n);
    expect((await db.globFiles('temp_geojson_*')).length).toBe(0);
  });

  it('preserves independent overlapping features, typed IDs, original coordinates and part metadata', async () => {
    const before = structuredClone(collection);
    const table = await load(collection);
    const output = await new GetLayerUseCase(conn).exec(table);
    expect(output.features).toHaveLength(2);
    const byId = new Map(output.features.map(f => [f.id, f]));
    expect(byId.get('building-a')?.geometry).toEqual(collection.features[0].geometry);
    expect(byId.get('building-a')?.properties).toEqual({ height: 12, parts: [{ geometryIndex: 0, height: 25 }] });
    expect(byId.get(42)?.geometry).toEqual({ type: 'GeometryCollection', geometries: [collection.features[1].geometry] });
    expect(collection).toEqual(before);
    const again = await new GetLayerUseCase(conn).exec(await load(output, 'again'));
    expect(again.features).toEqual(output.features);
  });

  it('assigns deterministic IDs without grouping features that have no supplied ID', async () => {
    const input = structuredClone(collection);
    for (const feature of input.features) delete feature.id;
    const output = await new GetLayerUseCase(conn).exec(await load(input));
    expect(output.features.map(f => f.id)).toEqual(['autk-feature-0', 'autk-feature-1']);
    expect(input.features.every(f => f.id === undefined)).toBe(true);
  });

  it('rejects duplicate supplied IDs before replacing an existing table', async () => {
    await load(collection);
    const input = structuredClone(collection);
    input.features[1].id = 'building-a';
    await expect(load(input)).rejects.toThrow(/Duplicate/);
    expect((await conn.query('SELECT COUNT(*) AS n FROM autk.buildings')).toArray()[0].n).toBe(2n);
  });

  it('filters whole buildings by bbox without clipping/reordering their parts', async () => {
    const table = await new LoadGeojsonUseCase(db, conn).exec({
      geojsonObject: collection, outputTableName: 'bbox', layerType: 'buildings',
      coordinateFormat: 'EPSG:4326', workspaceCoordinateFormat: 'EPSG:4326',
      boundingBox: { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 },
    });
    const output = await new GetLayerUseCase(conn).exec(table);
    expect(output.features).toHaveLength(1);
    expect(output.features[0].geometry).toEqual(collection.features[0].geometry);
    expect(output.features[0].properties?.parts).toEqual([{ geometryIndex: 0, height: 25 }]);
  });

  it('updates a building by its GeoJSON ID without losing its component attributes', async () => {
    const table = await load(collection);
    const input = structuredClone(collection);
    input.features = [input.features[0]];
    input.features[0].properties = { height: 30, parts: [{ geometryIndex: 0, height: 50 }] };
    const result = await new UpdateTableUseCase(db, conn).exec({
      tableName: 'buildings', strategy: 'update', idColumn: 'geojson_id', data: input,
    }, table);
    const output = await new GetLayerUseCase(conn).exec(result.table as typeof table);
    expect(output.features).toHaveLength(2);
    expect(output.features.find(f => f.id === 'building-a')?.properties?.parts).toEqual([{ geometryIndex: 0, height: 50 }]);
    expect(output.features.find(f => f.id === 42)?.properties?.height).toBe(15);
  });

  it('updates by an explicit internal row key without changing the public ID', async () => {
    const table = await load(collection);
    const input = structuredClone(collection);
    input.features = [input.features[0]];
    input.features[0].id = 1; // internal `id`, deliberately not its public `geojson_id`
    input.features[0].properties = { height: 30 };
    const result = await new UpdateTableUseCase(db, conn).exec({
      tableName: 'buildings', strategy: 'update', idColumn: 'id', data: input,
    }, table);
    const output = await new GetLayerUseCase(conn).exec(result.table as typeof table);
    expect(output.features.find(feature => feature.id === 'building-a')?.properties?.height).toBe(30);
    expect(output.features.find(feature => feature.id === 42)?.properties?.height).toBe(15);
  });

  it('rejects an update by public ID when the input feature has no ID', async () => {
    const table = await load(collection);
    const input = structuredClone(collection);
    input.features = [input.features[0]];
    delete input.features[0].id;
    input.features[0].properties = { height: 99 };
    await expect(new UpdateTableUseCase(db, conn).exec({
      tableName: 'buildings', strategy: 'update', idColumn: 'geojson_id', data: input,
    }, table)).rejects.toThrow(/feature ID.*required/i);
    expect((await new GetLayerUseCase(conn).exec(table)).features[0].properties?.height).toBe(12);
  });

  it('does not collide generated IDs with supplied IDs or confuse numeric and string IDs', async () => {
    const input = structuredClone(collection);
    input.features[0].id = 'autk-feature-1';
    delete input.features[1].id;
    const output = await new GetLayerUseCase(conn).exec(await load(input));
    expect(output.features.map(feature => feature.id)).toEqual(['autk-feature-1', 'autk-feature-1-generated']);
    input.features[0].id = 42;
    input.features[1].id = '42';
    expect((await new GetLayerUseCase(conn).exec(await load(input))).features.map(feature => feature.id)).toEqual([42, '42']);
  });

  it('rejects invalid geometry on import, update and replacement without changing the stored feature', async () => {
    const table = await load(collection);
    const input = structuredClone(collection);
    input.features = [input.features[0]];
    input.features[0].geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]] };
    await expect(load(input)).rejects.toThrow(/invalid geometry/i);
    for (const strategy of ['update', 'replace'] as const) {
      await expect(new UpdateTableUseCase(db, conn).exec({
        tableName: 'buildings', strategy, idColumn: 'geojson_id', data: input,
      }, table)).rejects.toThrow(/invalid geometry/i);
    }
    const output = await new GetLayerUseCase(conn).exec(table);
    expect(output.features).toHaveLength(2);
    expect(output.features[0].geometry).toEqual(collection.features[0].geometry);
  });

  it('normalizes parts on replacement and preserves IDs', async () => {
    const table = await load(collection);
    const result = await new UpdateTableUseCase(db, conn).exec({ tableName: 'buildings', strategy: 'replace', data: collection }, table);
    const output = await new GetLayerUseCase(conn).exec(result.table as typeof table);
    expect(output.features[0].id).toBe('building-a');
    expect(output.features[0].properties?.parts[0].geometryIndex).toBe(0);
    expect(output.features[1].geometry?.type).toBe('GeometryCollection');
  });
});
