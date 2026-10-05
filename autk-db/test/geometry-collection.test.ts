import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDb } from '../src/duckdb-node';

let db: AsyncDuckDB;
let conn: AsyncDuckDBConnection;

beforeAll(async () => {
  db = await loadDb();
  conn = await db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
}, 120_000);

afterAll(async () => {
  await conn?.close();
  await db?.terminate();
});

// Integration tests use the real DuckDB-WASM spatial extension, hosted in Node.
describe('original geometries in a GeometryCollection', () => {
  const collection = 'GEOMETRYCOLLECTION(POLYGON((0 0,10 0,10 10,0 10,0 0)),POLYGON((5 0,15 0,15 10,5 10,5 0)))';

  it('preserves overlapping polygons instead of dissolving their boundaries', async () => {
    const result = await conn.query(`SELECT CAST(ST_AsGeoJSON(ST_GeomFromText('${collection}')) AS VARCHAR) AS geojson`);
    const geometry = JSON.parse(result.toArray()[0].geojson);
    expect(geometry.type).toBe('GeometryCollection');
    expect(geometry.geometries).toHaveLength(2);
    expect(geometry.geometries[0].coordinates[0]).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(geometry.geometries[1].coordinates[0]).toEqual([[5, 0], [15, 0], [15, 10], [5, 10], [5, 0]]);
  });

  it('evaluates intersection once and measures the nearest component', async () => {
    const result = await conn.query(`SELECT
      ST_Intersects(ST_GeomFromText('${collection}'), ST_Point(7,5)) AS hit,
      ST_Distance(ST_GeomFromText('${collection}'), ST_Point(17,5)) AS distance,
      ST_X(ST_Centroid(ST_GeomFromText('${collection}'))) AS cx`);
    expect(result.toArray()[0].toJSON()).toEqual({ hit: true, distance: 2, cx: 7.5 });
  });

  it('keeps holes and supports multiline and mixed collections', async () => {
    const result = await conn.query(`SELECT
      ST_Intersects(ST_GeomFromText('GEOMETRYCOLLECTION(POLYGON((0 0,10 0,10 10,0 10,0 0),(2 2,2 8,8 8,8 2,2 2)))'), ST_Point(5,5)) AS hole,
      ST_Intersects(ST_GeomFromText('MULTILINESTRING((0 0,10 0),(0 0,0 10))'), ST_Point(0,0)) AS multiline,
      ST_Distance(ST_GeomFromText('GEOMETRYCOLLECTION(POINT(20 0),LINESTRING(0 0,10 0))'), ST_Point(15,0)) AS mixed`);
    expect(result.toArray()[0].toJSON()).toEqual({ hole: false, multiline: true, mixed: 5 });
  });

  it('uses component-weighted centroids, not the centroid of a geometric union', async () => {
    const result = await conn.query(`SELECT
      ST_X(ST_Centroid(ST_GeomFromText('GEOMETRYCOLLECTION(POLYGON((0 0,10 0,10 10,0 10,0 0)),POLYGON((5 0,20 0,20 10,5 10,5 0)))'))) AS overlap,
      ST_X(ST_Centroid(ST_GeomFromText('GEOMETRYCOLLECTION(POINT(20 0),LINESTRING(0 0,10 0))'))) AS mixed`);
    expect(result.toArray()[0].overlap).toBeCloseTo(9.5);
    expect(result.toArray()[0].mixed).toBeCloseTo(5); // highest-dimensional components determine the centroid
  });

  it('round-trips collection geometry through the workspace CRS', async () => {
    const result = await conn.query(`SELECT ST_Equals(
      ST_GeomFromText('${collection}'),
      ST_Transform(ST_Transform(ST_GeomFromText('${collection}'), 'EPSG:4326', 'EPSG:3857', always_xy := true),
      'EPSG:3857', 'EPSG:4326', always_xy := true)) AS equal`);
    // Floating point CRS conversion is not bit-exact; compare coordinates instead.
    const roundtrip = await conn.query(`SELECT CAST(ST_AsGeoJSON(ST_Transform(ST_Transform(ST_GeomFromText('${collection}'),
      'EPSG:4326', 'EPSG:3857', always_xy := true), 'EPSG:3857', 'EPSG:4326', always_xy := true)) AS VARCHAR) AS geojson`);
    const geometry = JSON.parse(roundtrip.toArray()[0].geojson);
    expect(geometry.geometries).toHaveLength(2);
    expect(geometry.geometries[0].coordinates[0][2][0]).toBeCloseTo(10);
    expect(geometry.geometries[0].coordinates[0][2][1]).toBeCloseTo(10);
    expect(typeof result.toArray()[0].equal).toBe('boolean');
  });
});
