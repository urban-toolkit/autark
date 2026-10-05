import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { SpatialJoinUseCase } from '../src/use-cases/spatial-join/use-case';
import { GetLayerUseCase } from '../src/use-cases/get-layer/use-case';
import { getColumnsFromDuckDbTableDescribe } from '../src/utils';
import type { AggregateFunction } from '../src/use-cases/spatial-join/interfaces';
import type { Table } from '../src/interfaces';

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

beforeEach(async () => {
  await conn.query(`CREATE OR REPLACE TABLE autk.root (properties JSON, geometry GEOMETRY);
    CREATE OR REPLACE TABLE autk.other (properties JSON, geometry GEOMETRY);`);
});

async function table(name: string): Promise<Table> {
  const columns = getColumnsFromDuckDbTableDescribe((await conn.query(`DESCRIBE autk.${name}`)).toArray());
  return { source: 'geojson', type: 'polygons', name, columns };
}

async function join(groupBy?: Array<{ column: string; aggregateFn?: AggregateFunction; normalize?: boolean }>, near?: { distance: number; useCentroid?: boolean }) {
  const result = await new SpatialJoinUseCase(conn).exec({ tableRootName: 'root', tableJoinName: 'other', groupBy, near },
    [await table('root'), await table('other')], 'autk');
  return new GetLayerUseCase(conn).exec(result);
}

describe('spatial matches are pairs of whole features', () => {
  it.each([
    'POINT(0 0)',
    'MULTIPOINT((0 0),(1 0))',
    'LINESTRING(0 0,2 0)',
    'MULTILINESTRING((0 0,2 0),(0 0,0 2))',
    'POLYGON((0 0,2 0,2 2,0 2,0 0))',
    'MULTIPOLYGON(((0 0,2 0,2 2,0 2,0 0)),((3 0,5 0,5 2,3 2,3 0)))',
    'GEOMETRYCOLLECTION(POLYGON((0 0,2 0,2 2,0 2,0 0)),POLYGON((1 0,3 0,3 2,1 2,1 0)))',
  ])('counts one match in both directions for %s', async wkt => {
    for (const [root, other] of [[wkt, 'POINT(0 0)'], ['POINT(0 0)', wkt]]) {
      await conn.query(`DELETE FROM autk.root; DELETE FROM autk.other;
        INSERT INTO autk.root (properties, geometry) VALUES ('{}', ST_GeomFromText('${root}'));
        INSERT INTO autk.other VALUES ('{"value":2}', ST_GeomFromText('${other}'));`);
      const output = await join([{ column: '*', aggregateFn: 'count' }]);
      expect(output.features).toHaveLength(1);
      expect(output.features[0].properties?.sjoin.count.other).toBe(1);
    }
  });

  it('preserves distinct features even with identical geometry and properties', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_Point(0,0)), ('{}',ST_Point(0,0));
      INSERT INTO autk.other VALUES ('{"value":2}',ST_Point(0,0)), ('{"value":2}',ST_Point(0,0));`);
    const output = await join([
      { column: '*', aggregateFn: 'count' },
      { column: 'value', aggregateFn: 'sum' },
      { column: 'value', aggregateFn: 'avg' },
      { column: 'value', aggregateFn: 'collect' },
      { column: '*', aggregateFn: 'weighted' },
    ]);
    expect(output.features).toHaveLength(2);
    for (const feature of output.features) {
      expect(feature.properties?.sjoin.count.other).toBe(2);
      expect(feature.properties?.sjoin.sum['other.value']).toBe(4);
      expect(feature.properties?.sjoin.avg['other.value']).toBe(2);
      expect(feature.properties?.sjoin.collect.other).toHaveLength(2);
      expect(feature.properties?.sjoin.weighted.other).toBe(2);
    }
  });

  it('does not treat a user column named rowid as the feature identity', async () => {
    await conn.query(`ALTER TABLE autk.root ADD COLUMN rowid INTEGER;
      ALTER TABLE autk.root ADD COLUMN "Autk_Root_Feature_Key" INTEGER;
      INSERT INTO autk.root VALUES ('{}',ST_Point(0,0),7,9), ('{}',ST_Point(0,0),7,9);
      INSERT INTO autk.other VALUES ('{}',ST_Point(0,0));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }]);
    expect(output.features).toHaveLength(2);
    expect(output.features.map(feature => feature.properties?.sjoin.count.other)).toEqual([1, 1]);
  });

  it('stores unaggregated matches once without duplicating root geometry', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{"parts":[{"geometryIndex":0,"height":12}]}',ST_Point(0,0));
      INSERT INTO autk.other VALUES ('{"name":"a"}',ST_Point(0,0)), ('{"name":"b"}',ST_Point(0,0));`);
    const output = await join();
    expect(output.features).toHaveLength(1);
    expect(output.features[0].properties?.parts).toEqual([{ geometryIndex: 0, height: 12 }]);
    expect(output.features[0].properties?.sjoin.matches).toHaveLength(2);
    expect((await conn.query('SELECT COUNT(*) AS n FROM autk.root')).toArray()[0].n).toBe(1n);
  });

  it('counts only non-null values of a named property without counting parts', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_Point(0,0));
      INSERT INTO autk.other VALUES ('{"value":2}',ST_Point(0,0)), ('{"value":2}',ST_Point(0,0)), ('{"value":null}',ST_Point(0,0));`);
    const output = await join([{ column: 'value', aggregateFn: 'count' }]);
    expect(output.features[0].properties?.sjoin.count.other).toBe(2);
  });

  it('reports zero count and empty collections without matches', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_Point(0,0));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }, { column: '*', aggregateFn: 'collect' }]);
    expect(output.features[0].properties?.sjoin.count.other).toBe(0);
    expect(output.features[0].properties?.sjoin.collect.other).toEqual([]);
    const plain = await join();
    expect(plain.features[0].properties?.sjoin.matches).toEqual([]);
  });

  it('does not match a polygon hole and does include a boundary contact', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}', ST_GeomFromText('GEOMETRYCOLLECTION(POLYGON((0 0,10 0,10 10,0 10,0 0),(2 2,2 8,8 8,8 2,2 2)))'));
      INSERT INTO autk.other VALUES ('{}',ST_Point(5,5)), ('{}',ST_Point(0,5));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }]);
    expect(output.features[0].properties?.sjoin.count.other).toBe(1);
  });

  it('uses minimum component distance for NEAR without centroid', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_GeomFromText('GEOMETRYCOLLECTION(LINESTRING(0 0,1 0),LINESTRING(10 0,11 0))'));
      INSERT INTO autk.other VALUES ('{}',ST_Point(12,0));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }, { column: '*', aggregateFn: 'weighted' }],
      { distance: 1, useCentroid: false });
    expect(output.features[0].properties?.sjoin.count.other).toBe(1);
    expect(output.features[0].properties?.sjoin.weighted.other).toBe(0.5);
  });

  it('does not pre-filter a centroid that lies between distant components', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_Point(0,0));
      INSERT INTO autk.other VALUES ('{}',ST_GeomFromText('MULTIPOINT((-10 0),(10 0))'));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }], { distance: 0.1, useCentroid: true });
    expect(output.features[0].properties?.sjoin.count.other).toBe(1);
  });

  it('keeps empty and null root features without matching them', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',NULL), ('{}',ST_GeomFromText('GEOMETRYCOLLECTION EMPTY'));
      INSERT INTO autk.other VALUES ('{}',ST_Point(0,0));`);
    const output = await join([{ column: '*', aggregateFn: 'count' }], { distance: 1, useCentroid: false });
    expect(output.features).toHaveLength(2);
    expect(output.features.map(f => f.properties?.sjoin.count.other)).toEqual([0, 0]);
  });

  it('normalizes aggregate results without changing root cardinality', async () => {
    await conn.query(`INSERT INTO autk.root VALUES ('{}',ST_Point(0,0)), ('{}',ST_Point(10,0));
      INSERT INTO autk.other VALUES ('{}',ST_Point(0,0));`);
    const output = await join([{ column: '*', aggregateFn: 'count', normalize: true }]);
    expect(output.features).toHaveLength(2);
    expect(output.features.map(f => f.properties?.sjoin.count.other_norm).sort()).toEqual([0, 1]);
  });
});
