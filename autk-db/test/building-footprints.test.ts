import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadDb } from '../src/duckdb-node';
import type { Column, OsmLayerTable, Table } from '../src/interfaces';
import { ProcessOsmBuildingsUseCase } from '../src/internal/process-osm-buildings/use-case';
import { GetLayerUseCase } from '../src/use-cases/get-layer/use-case';
import { SpatialJoinUseCase } from '../src/use-cases/spatial-join/use-case';
import { getColumnsFromDuckDbTableDescribe } from '../src/utils';

const WORKSPACE = 'autk';

// Parts 1 and 2 overlap, so they form one building (footprint area 150); part 3 is a building on its own.
const PARTS = [
  { id: 1, wkt: 'POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))' },
  { id: 2, wkt: 'POLYGON((5 0, 15 0, 15 10, 5 10, 5 0))' },
  { id: 3, wkt: 'POLYGON((100 0, 110 0, 110 10, 100 10, 100 0))' },
];

let db: AsyncDuckDB;
let conn: AsyncDuckDBConnection;

async function rows(sql: string): Promise<any[]> {
  return (await conn.query(sql)).toArray().map((row: any) => row.toJSON());
}

async function columnsOf(table: string): Promise<Column[]> {
  return getColumnsFromDuckDbTableDescribe((await conn.query(`DESCRIBE ${WORKSPACE}.${table}`)).toArray());
}

/** Creates the building parts and runs the OSM building pass on them, as `loadOsm` does for the buildings layer. */
async function loadBuildings(queryConn: AsyncDuckDBConnection = conn): Promise<OsmLayerTable> {
  await conn.query(
    `CREATE OR REPLACE TABLE ${WORKSPACE}.buildings (id BIGINT, properties MAP(VARCHAR, VARCHAR), geometry GEOMETRY)`,
  );
  for (const part of PARTS) {
    await conn.query(
      `INSERT INTO ${WORKSPACE}.buildings VALUES (${part.id}, MAP {'name': 'part ${part.id}'}, ST_GeomFromText('${part.wkt}'))`,
    );
  }
  const columns = await new ProcessOsmBuildingsUseCase(db, queryConn).exec({ tableName: 'buildings', workspace: WORKSPACE });
  return { source: 'osm', type: 'buildings', name: 'buildings', columns };
}

/** Creates a point layer with a single feature at (x, y). */
async function loadPoint(x: number, y: number): Promise<Table> {
  await conn.query(`CREATE OR REPLACE TABLE ${WORKSPACE}.probe (pid BIGINT, weight DOUBLE, geometry GEOMETRY)`);
  await conn.query(`INSERT INTO ${WORKSPACE}.probe VALUES (1, 1.5, ST_Point(${x}, ${y}))`);
  return { source: 'geojson', type: 'points', name: 'probe', columns: await columnsOf('probe') };
}

/** Ids of the building parts that the point was joined onto. */
async function matchedParts(): Promise<number[]> {
  const parts = await rows(`SELECT id, CAST(properties AS VARCHAR) AS props FROM ${WORKSPACE}.buildings ORDER BY id`);
  return parts.filter((part) => JSON.parse(part.props).sjoin?.pid != null).map((part) => Number(part.id));
}

/** Wraps a connection so the footprint union fails for the building containing `partId`, as GEOS sometimes does. */
function failUnionForPart(target: AsyncDuckDBConnection, partId: number): AsyncDuckDBConnection {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (prop !== 'query') return typeof value === 'function' ? value.bind(obj) : value;
      return async (sql: string) => {
        if (sql.includes('ST_Union_Agg')) {
          const [{ building_id: buildingId }] = await rows(`SELECT building_id FROM ${WORKSPACE}.buildings WHERE id = ${partId}`);
          if (new RegExp(`building_id (IN \\([^)]*\\b${buildingId}\\b|= ${buildingId}\\b)`).test(sql)) {
            throw new Error('TopologyException: simulated');
          }
        }
        return obj.query(sql);
      };
    },
  });
}

beforeAll(async () => {
  db = await loadDb();
  conn = await db.connect();
  await conn.query('INSTALL spatial; LOAD spatial;');
  await conn.query(`CREATE SCHEMA IF NOT EXISTS ${WORKSPACE}`);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await conn?.close();
  await db?.terminate();
});

describe('building footprints', () => {
  it('stores the footprint as a GEOMETRY column', async () => {
    const buildings = await loadBuildings();

    expect(buildings.columns).toContainEqual({ name: 'agg_geometry', type: 'GEOMETRY' });
    // Code that takes the first GEOMETRY column (bounding boxes, clipping) still gets the part geometry.
    expect(buildings.columns.find((column) => column.type === 'GEOMETRY')?.name).toBe('geometry');
  });

  it("merges each building's parts and keeps each part's own geometry", async () => {
    await loadBuildings();
    const parts = await rows(
      `SELECT building_id, ST_Area(geometry) AS part_area, ST_Area(agg_geometry) AS footprint_area
       FROM ${WORKSPACE}.buildings ORDER BY id`,
    );

    expect(parts.map((part) => part.part_area)).toEqual([100, 100, 100]);
    expect(parts.map((part) => part.footprint_area)).toEqual([150, 150, 100]);
    expect(parts[0].building_id).toBe(parts[1].building_id);
    expect(parts[2].building_id).not.toBe(parts[0].building_id);
  });

  it('exports buildings from their parts, without the footprint', async () => {
    const buildings = await loadBuildings();
    const layer = await new GetLayerUseCase(conn).exec(buildings, WORKSPACE);

    expect(layer.features.map((feature: any) => feature.geometry.geometries.length).sort()).toEqual([1, 2]);
    for (const feature of layer.features) expect(feature.properties).not.toHaveProperty('agg_geometry');
  });

  it("falls back to a part's own geometry when its building's union fails", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadBuildings(failUnionForPart(conn, 3));
    const parts = await rows(
      `SELECT ST_Area(agg_geometry) AS footprint_area, ST_Equals(agg_geometry, geometry) AS own_geometry
       FROM ${WORKSPACE}.buildings ORDER BY id`,
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed for building_id='), expect.any(String));
    expect(parts.map((part) => part.footprint_area)).toEqual([150, 150, 100]);
    expect(parts[2].own_geometry).toBe(true);
  });
});

describe('spatial joins on buildings', () => {
  it('matches every part of a building when a feature touches one part', async () => {
    const buildings = await loadBuildings();
    const probe = await loadPoint(2, 5); // inside part 1 only
    await new SpatialJoinUseCase(conn).exec({ tableRootName: 'buildings', tableJoinName: 'probe' }, [buildings, probe], WORKSPACE);

    expect(await matchedParts()).toEqual([1, 2]);
  });

  it("measures NEAR distances from the footprint's centroid", async () => {
    // The footprint of parts 1 and 2 is centered at (7.5, 5); the parts' own centroids, (5, 5) and (10, 5), are 3.2 away.
    const buildings = await loadBuildings();
    const probe = await loadPoint(7.5, 7);
    await new SpatialJoinUseCase(conn).exec(
      { tableRootName: 'buildings', tableJoinName: 'probe', near: { distance: 2.5, useCentroid: true } },
      [buildings, probe],
      WORKSPACE,
    );

    expect(await matchedParts()).toEqual([1, 2]);
  });

  it('aggregates per part and keeps the footprint through the join', async () => {
    const buildings = await loadBuildings();
    const probe = await loadPoint(2, 5);
    const joined = await new SpatialJoinUseCase(conn).exec(
      { tableRootName: 'buildings', tableJoinName: 'probe', groupBy: [{ column: 'weight', aggregateFn: 'count' }] },
      [buildings, probe],
      WORKSPACE,
    );
    const parts = await rows(`SELECT CAST(properties AS VARCHAR) AS props FROM ${WORKSPACE}.buildings ORDER BY id`);

    expect(parts.map((part) => JSON.parse(part.props).sjoin.count.probe)).toEqual([1, 1, 0]);
    expect(joined.columns).toContainEqual({ name: 'agg_geometry', type: 'GEOMETRY' });
  });

  it('matches by footprint when buildings are the join table', async () => {
    // A point inside part 1 falls within the footprint that both parts carry, so it counts both parts.
    const buildings = await loadBuildings();
    const probe = await loadPoint(2, 5);
    await new SpatialJoinUseCase(conn).exec(
      { tableRootName: 'probe', tableJoinName: 'buildings', groupBy: [{ column: 'building_id', aggregateFn: 'count' }] },
      [probe, buildings],
      WORKSPACE,
    );
    const [point] = await rows(`SELECT CAST(properties AS VARCHAR) AS props FROM ${WORKSPACE}.probe`);

    expect(JSON.parse(point.props).sjoin.count.buildings).toBe(2);
  });

  it("still matches a building whose union failed, by its part's geometry", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const buildings = await loadBuildings(failUnionForPart(conn, 3));
    const probe = await loadPoint(105, 5); // inside part 3
    await new SpatialJoinUseCase(conn).exec({ tableRootName: 'buildings', tableJoinName: 'probe' }, [buildings, probe], WORKSPACE);

    expect(await matchedParts()).toEqual([3]);
  });
});
