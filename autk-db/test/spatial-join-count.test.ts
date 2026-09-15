import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadDb } from '../src/duckdb-node';
import type { Table } from '../src/interfaces';
import { SpatialJoinUseCase } from '../src/use-cases/spatial-join/use-case';
import { getColumnsFromDuckDbTableDescribe } from '../src/utils';

const WORKSPACE = 'autk';

// Three parcels; only the first one contains the single point in the join table.
const PARCELS = [
  { id: 1, wkt: 'POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))' },
  { id: 2, wkt: 'POLYGON((20 0, 30 0, 30 10, 20 10, 20 0))' },
  { id: 3, wkt: 'POLYGON((40 0, 50 0, 50 10, 40 10, 40 0))' },
];

let db: AsyncDuckDB;
let conn: AsyncDuckDBConnection;

async function rows(sql: string): Promise<any[]> {
  return (await conn.query(sql)).toArray().map((row: any) => row.toJSON());
}

async function tableOf(name: string, type: 'polygons' | 'points'): Promise<Table> {
  const columns = getColumnsFromDuckDbTableDescribe((await conn.query(`DESCRIBE ${WORKSPACE}.${name}`)).toArray());
  return { source: 'geojson', type, name, columns };
}

/** Counts reported for each parcel, in id order. */
async function countsPerParcel(): Promise<number[]> {
  const parcels = await rows(`SELECT id, CAST(properties AS VARCHAR) AS props FROM ${WORKSPACE}.parcels ORDER BY id`);
  return parcels.map((parcel) => Number(JSON.parse(parcel.props).sjoin.count.trees ?? 0));
}

beforeAll(async () => {
  db = await loadDb();
  conn = await db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
  await conn.query(`CREATE SCHEMA IF NOT EXISTS ${WORKSPACE}`);
}, 120_000);

beforeEach(async () => {
  await conn.query(`CREATE OR REPLACE TABLE ${WORKSPACE}.parcels (id BIGINT, properties MAP(VARCHAR, VARCHAR), geometry GEOMETRY)`);
  for (const parcel of PARCELS) {
    await conn.query(
      `INSERT INTO ${WORKSPACE}.parcels VALUES (${parcel.id}, MAP {'name': 'parcel ${parcel.id}'}, ST_GeomFromText('${parcel.wkt}'))`,
    );
  }
  await conn.query(`CREATE OR REPLACE TABLE ${WORKSPACE}.trees (tree_id BIGINT, height DOUBLE, geometry GEOMETRY)`);
  await conn.query(`INSERT INTO ${WORKSPACE}.trees VALUES (1, 12.5, ST_Point(5, 5))`);
});

afterAll(async () => {
  await conn?.close();
  await db?.terminate();
});

describe('spatial join counts', () => {
  it("counts matches, not rows, for '*'", async () => {
    const parcels = await tableOf('parcels', 'polygons');
    const trees = await tableOf('trees', 'points');
    await new SpatialJoinUseCase(conn).exec(
      { tableRootName: 'parcels', tableJoinName: 'trees', groupBy: [{ column: '*', aggregateFn: 'count' }] },
      [parcels, trees],
      WORKSPACE,
    );

    // The join is a LEFT join: without matches the count is 0, not 1.
    expect(await countsPerParcel()).toEqual([1, 0, 0]);
  });

  it('counts a named column the same way', async () => {
    const parcels = await tableOf('parcels', 'polygons');
    const trees = await tableOf('trees', 'points');
    await new SpatialJoinUseCase(conn).exec(
      { tableRootName: 'parcels', tableJoinName: 'trees', groupBy: [{ column: 'height', aggregateFn: 'count' }] },
      [parcels, trees],
      WORKSPACE,
    );

    expect(await countsPerParcel()).toEqual([1, 0, 0]);
  });
});
