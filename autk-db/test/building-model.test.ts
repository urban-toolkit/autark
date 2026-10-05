import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { ProcessOsmBuildingsUseCase } from '../src/internal/process-osm-buildings/use-case';
import { GetLayerUseCase } from '../src/use-cases/get-layer/use-case';
import { SpatialJoinUseCase } from '../src/use-cases/spatial-join/use-case';
import { getColumnsFromDuckDbTableDescribe } from '../src/utils';
import type { OsmLayerTable, Table } from '../src/interfaces';

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

afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  await conn.query('CREATE OR REPLACE TABLE autk.buildings (id BIGINT, properties JSON, geometry GEOMETRY)');
});

async function process(): Promise<OsmLayerTable> {
  const columns = await new ProcessOsmBuildingsUseCase(db, conn).exec({ tableName: 'buildings' });
  return { source: 'osm', type: 'buildings', name: 'buildings', columns };
}

async function points(): Promise<Table> {
  await conn.query(`CREATE OR REPLACE TABLE autk.probe AS
    SELECT i AS pid, 2.0 AS weight, ST_Point(CASE WHEN i < 3 THEN 2 ELSE 12 END, 5) AS geometry FROM range(8) t(i)`);
  const columns = getColumnsFromDuckDbTableDescribe((await conn.query('DESCRIBE autk.probe')).toArray());
  return { source: 'geojson', type: 'points', name: 'probe', columns };
}

async function parts(): Promise<void> {
  await conn.query(`INSERT INTO autk.buildings VALUES
    (20, '{"height":25}', ST_GeomFromText('POLYGON((5 0,15 0,15 10,5 10,5 0))')),
    (10, '{"height":12}', ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))'))`);
}

describe('orphan parts associate by unique outline containment', () => {
  it.each([
    { name: 'yes tag', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: true },
    { name: 'typed part tag', tag: 'apartments', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: true },
    { name: 'boundary contact', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((0 0,3 0,3 3,0 3,0 0))', joins: true },
    { name: 'multipolygon part', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'MULTIPOLYGON(((2 2,3 2,3 3,2 3,2 2)),((7 7,8 7,8 8,7 8,7 7)))', joins: true },
    { name: 'multipolygon with an outside component', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'MULTIPOLYGON(((2 2,3 2,3 3,2 3,2 2)),((12 2,13 2,13 3,12 3,12 2)))', joins: false },
    { name: 'empty-role building outline', tag: 'yes', role: '', outlineTags: '{"building":"office"}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: true },
    { name: 'outer-role building outline', tag: 'yes', role: 'outer', outlineTags: '{"building":"yes"}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: true },
    { name: 'partial overlap', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((9 2,11 2,11 3,9 3,9 2))', joins: false },
    { name: 'disjoint part', tag: 'yes', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((12 2,13 2,13 3,12 3,12 2))', joins: false },
    { name: 'explicit part=no', tag: 'no', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: false },
    { name: 'independent building', tag: '', role: 'outline', outlineTags: '{}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: false },
    { name: 'member part is not an outline', tag: 'yes', role: 'part', outlineTags: '{"building":"yes"}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: false },
    { name: 'untyped member is not an outline', tag: 'yes', role: '', outlineTags: '{}', geometry: 'POLYGON((2 2,3 2,3 3,2 3,2 2))', joins: false },
  ])('$name', async ({ tag, role, outlineTags, geometry, joins }) => {
    await conn.query(`INSERT INTO autk.buildings VALUES
      (100, '${outlineTags}', ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))')),
      (20, '{"building":"yes","building:part":"${tag}","height":"17","min_height":"11"}', ST_GeomFromText('${geometry}'))`);
    const original = (await conn.query('SELECT id,ST_AsWKB(geometry) bytes FROM autk.buildings ORDER BY id')).toArray();
    const columns = await new ProcessOsmBuildingsUseCase(db, conn).exec({ tableName: 'buildings',
      relations: [{ id: '600', properties: { name: 'General building', height: '30' }, members: [{ id: '100', role }] }] });
    const output = await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns });
    const building = output.features.find(feature => feature.properties?.osmRelation?.id === '600')!;
    expect(building.properties?.parts.map((part: any) => part.id)).toEqual(joins ? [20,100] : [100]);
    expect(output.features).toHaveLength(joins ? 1 : 2);
    expect(building.id).toBe(joins ? 20 : 100);
    if (joins) {
      expect(building.properties?.parts[0]).toMatchObject({ height: '17', min_height: '11', geometryIndex: 0 });
      expect(building.properties?.osmRelation).toMatchObject({ members: [{ id: '100', role }],
        inferredParts: [{ id: '20', method: 'outline-containment' }] });
    }
    expect((await conn.query(`SELECT CAST(properties->'parts'->CAST(part.key AS INT)->>'id' AS BIGINT) id,
      ST_AsWKB(ST_GeomFromGeoJSON(part.value)) bytes FROM autk.buildings,
      LATERAL json_each(CAST(ST_AsGeoJSON(geometry) AS JSON)->'geometries') part ORDER BY id`)).toArray()).toEqual(original);
  });

  it('does not guess between overlapping relation outlines or override explicit ownership', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await conn.query(`INSERT INTO autk.buildings VALUES
      (100, '{}', ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))')),
      (200, '{}', ST_GeomFromText('POLYGON((1 1,9 1,9 9,1 9,1 1))')),
      (20, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((2 2,3 2,3 3,2 3,2 2))')),
      (30, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((4 4,5 4,5 5,4 5,4 4))'))`);
    const columns = await new ProcessOsmBuildingsUseCase(db, conn).exec({ tableName: 'buildings', relations: [
      { id: '600', properties: {}, members: [{ id: '100', role: 'outline' }] },
      { id: '700', properties: {}, members: [{ id: '200', role: 'outline' }, { id: '30', role: 'part' }] },
    ] });
    const output = await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns });
    expect(output.features).toHaveLength(3);
    expect(output.features.find(feature => feature.properties?.osmRelation?.id === '600')?.properties?.parts.map((p: any) => p.id)).toEqual([100]);
    expect(output.features.find(feature => feature.properties?.osmRelation?.id === '700')?.properties?.parts.map((p: any) => p.id)).toEqual([30,200]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/part 20.*ambiguous.*600.*700/));
  });

  it('respects holes, skipped relations and underground exclusions', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await conn.query(`INSERT INTO autk.buildings VALUES
      (100, '{}', ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0),(2 2,2 4,4 4,4 2,2 2))')),
      (20, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((2.5 2.5,3.5 2.5,3.5 3.5,2.5 3.5,2.5 2.5))')),
      (30, '{"building:part":"yes","location":"underground"}', ST_GeomFromText('POLYGON((5 5,6 5,6 6,5 6,5 5))')),
      (200, '{}', ST_GeomFromText('POLYGON((12 0,22 0,22 10,12 10,12 0))')),
      (40, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((13 1,14 1,14 2,13 2,13 1))'))`);
    const columns = await new ProcessOsmBuildingsUseCase(db, conn).exec({ tableName: 'buildings', relations: [
      { id: '600', properties: {}, members: [{ id: '100', role: 'outline' }] },
      { id: '700', properties: {}, members: [{ id: '200', role: 'outline' }, { id: '999', role: 'part' }] },
    ] });
    const output = await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns });
    expect(output.features.map(feature => feature.id).sort((a,b) => Number(a)-Number(b))).toEqual([20,40,100]);
    expect(output.features.find(feature => feature.id === 100)?.properties?.parts.map((p: any) => p.id)).toEqual([100]);
  });

  it('counts overlapping outlines of the same relation once, without pulling an intersecting orphan outside', async () => {
    await conn.query(`INSERT INTO autk.buildings VALUES
      (100, '{}', ST_GeomFromText('MULTIPOLYGON(((0 0,10 0,10 10,0 10,0 0)),((20 0,30 0,30 10,20 10,20 0)))')),
      (200, '{}', ST_GeomFromText('POLYGON((1 1,9 1,9 9,1 9,1 1))')),
      (20, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((2 2,3 2,3 3,2 3,2 2))')),
      (30, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((22 2,23 2,23 3,22 3,22 2))')),
      (40, '{"building:part":"yes"}', ST_GeomFromText('POLYGON((2 2,11 2,11 3,2 3,2 2))'))`);
    const columns = await new ProcessOsmBuildingsUseCase(db, conn).exec({ tableName: 'buildings',
      relations: [{ id: '600', properties: {}, members: [{ id: '100', role: 'outline' }, { id: '200', role: 'outline' }] }] });
    const output = await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns });
    expect(output.features).toHaveLength(2);
    expect(output.features.find(feature => feature.properties?.osmRelation)?.properties?.parts.map((p: any) => p.id)).toEqual([20,30,100,200]);
    expect(output.features.find(feature => !feature.properties?.osmRelation)?.properties?.parts.map((p: any) => p.id)).toEqual([40]);
  });
});

describe('one stored feature per OSM building', () => {
  it.each([1, 2, 5])('stores %i original parts once, with explicit metadata', async count => {
    for (let i = count; i > 0; i--) {
      await conn.query(`INSERT INTO autk.buildings VALUES (${i}, '{"height":${i * 10}}',
        ST_GeomFromText('POLYGON((${i} 0,${i + 10} 0,${i + 10} 10,${i} 10,${i} 0))'))`);
    }
    const table = await process();
    const rows = (await conn.query('SELECT * EXCLUDE(geometry) FROM autk.buildings')).toArray();
    expect(rows).toHaveLength(1);
    expect(table.columns.some(c => c.name === 'agg_geometry')).toBe(false);
    const output = await new GetLayerUseCase(conn).exec(table);
    expect(output.features).toHaveLength(1);
    const feature = output.features[0];
    expect(feature.id).toBe(1);
    expect(feature.geometry?.type).toBe('GeometryCollection');
    if (feature.geometry?.type !== 'GeometryCollection') throw new Error('not a collection');
    expect(feature.geometry.geometries).toHaveLength(count);
    expect(feature.properties?.parts.map((p: any) => [p.geometryIndex, p.height])).toEqual(
      Array.from({ length: count }, (_, i) => [i, (i + 1) * 10]),
    );
    expect(feature.geometry.geometries[0]).toMatchObject({ coordinates: [[[1, 0], [11, 0], [11, 10], [1, 10], [1, 0]]] });
  });

  it('preserves component coordinate precision when building the collection', async () => {
    await conn.query(`INSERT INTO autk.buildings VALUES (10, '{"height":12}',
      ST_GeomFromText('POLYGON((0.12345678912345678 0,1.1234567891234568 0,1.1234567891234568 1,0.12345678912345678 1,0.12345678912345678 0))'))`);
    const original = (await conn.query('SELECT ST_AsWKB(geometry) AS bytes FROM autk.buildings')).toArray()[0].bytes;
    await process();
    const collected = (await conn.query('SELECT ST_AsWKB((ST_Dump(geometry)[1]).geom) AS bytes FROM autk.buildings')).toArray()[0].bytes;
    expect(collected).toEqual(original);
  });

  it('handles an empty building layer with the final schema', async () => {
    const table = await process();
    expect(table.columns).toContainEqual({ name: 'building_id', type: 'BIGINT' });
    expect((await new GetLayerUseCase(conn).exec(table)).features).toEqual([]);
  });

  it('returns count 8 for three points in one part and five in another', async () => {
    await parts();
    const buildings = await process();
    const probe = await points();
    const joined = await new SpatialJoinUseCase(conn).exec({
      tableRootName: 'buildings', tableJoinName: 'probe', groupBy: [{ column: '*', aggregateFn: 'count' }],
    }, [buildings, probe], 'autk');
    const output = await new GetLayerUseCase(conn).exec(joined as OsmLayerTable);
    expect(output.features).toHaveLength(1);
    expect(output.features[0].properties?.sjoin.count.probe).toBe(8);
    expect(output.features[0].properties?.parts).toHaveLength(2);
  });

  it('counts one building when a point intersects both overlapping parts', async () => {
    await parts();
    const buildings = await process();
    const probe = await points();
    await conn.query('DELETE FROM autk.probe; INSERT INTO autk.probe VALUES (1, 2.0, ST_Point(7,5))');
    const joined = await new SpatialJoinUseCase(conn).exec({
      tableRootName: 'probe', tableJoinName: 'buildings', groupBy: [{ column: '*', aggregateFn: 'count' }],
    }, [probe, buildings], 'autk');
    const output = await new GetLayerUseCase(conn).exec(joined);
    expect(output.features[0].properties?.sjoin.count.buildings).toBe(1);
  });

  it('promotes only attributes common to every part, without choosing conflicting heights', async () => {
    await parts();
    await conn.query(`UPDATE autk.buildings SET properties = json_merge_patch(properties, '{"name":"Shared name","building":"yes"}');
      UPDATE autk.buildings SET properties = json_merge_patch(properties, '{"roof:shape":"flat"}') WHERE id = 10;`);
    const output = await new GetLayerUseCase(conn).exec(await process());
    const properties = output.features[0].properties!;
    expect(properties.name).toBe('Shared name');
    expect(properties.building).toBe('yes');
    expect(properties).not.toHaveProperty('height');
    expect(properties).not.toHaveProperty('roof:shape');
    expect(properties.parts.map((part: any) => [part.id, part.geometryIndex, part.height])).toEqual([[10, 0, 12], [20, 1, 25]]);
    expect(properties.parts[0]['roof:shape']).toBe('flat');
    expect(properties.parts[1]).not.toHaveProperty('roof:shape');
  });

  it('excludes explicit underground geometry before clustering, without filtering zero height, negative layer or basement tags', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await conn.query(`INSERT INTO autk.buildings VALUES
      (10, '{"height":12,"building:levels:underground":2}', ST_GeomFromText('POLYGON((0 0,2 0,2 2,0 2,0 0))')),
      (20, '{"height":0,"layer":-1}', ST_GeomFromText('POLYGON((8 0,10 0,10 2,8 2,8 0))')),
      (30, '{"height":0,"location":"underground"}', ST_GeomFromText('POLYGON((1 0,9 0,9 2,1 2,1 0))'))`);
    const original = (await conn.query('SELECT id, ST_AsWKB(geometry) bytes FROM autk.buildings WHERE id IN (10,20) ORDER BY id')).toArray();
    const output = await new GetLayerUseCase(conn).exec(await process());
    expect(output.features.map(feature => feature.id).sort((a,b) => Number(a)-Number(b))).toEqual([10,20]);
    expect(output.features.map(feature => feature.properties?.parts.length)).toEqual([1,1]);
    expect((await conn.query('SELECT id, ST_AsWKB((ST_Dump(geometry)[1]).geom) bytes FROM autk.buildings ORDER BY id')).toArray()).toEqual(original);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 30.*location=underground/));
  });

  it('omits an underground member but keeps above-ground parts of an explicit building relation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parts();
    await conn.query(`UPDATE autk.buildings SET properties=json_merge_patch(properties,'{"location":"underground"}') WHERE id=20`);
    const columns = await new ProcessOsmBuildingsUseCase(db,conn).exec({ tableName: 'buildings',
      relations: [{ id: '600', properties: { name: 'Surface building' }, members: [{ id: '10', role: 'part' }, { id: '20', role: 'part' }] }] });
    const output = await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns });
    expect(output.features).toHaveLength(1);
    expect(output.features[0].properties?.parts.map((part: any) => [part.id,part.geometryIndex])).toEqual([[10,0]]);
    expect(output.features[0].properties?.osmRelation.id).toBe('600');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/part 20.*location=underground/));
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/partial building/));
  });

  it('excludes a relation tagged underground even if its member ways have no location tags', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parts();
    const columns = await new ProcessOsmBuildingsUseCase(db,conn).exec({ tableName: 'buildings',
      relations: [{ id: '600', properties: { location: 'underground' }, members: [{ id: '10', role: 'part' }, { id: '20', role: 'part' }] }] });
    expect((await new GetLayerUseCase(conn).exec({ source: 'osm', type: 'buildings', name: 'buildings', columns })).features).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/relation 600.*location=underground/));
  });

  it('logs and skips invalid geometry while retaining valid features and exact coordinates', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await conn.query(`INSERT INTO autk.buildings VALUES
      (10, '{"height":12}', ST_GeomFromText('POLYGON((0 0,10 10,10 0,0 10,0 0))')),
      (20, '{"height":25}', ST_GeomFromText('POLYGON((20 0,30 0,30 10,20 10,20 0))'))`);
    const original = (await conn.query('SELECT ST_AsWKB(geometry) AS bytes FROM autk.buildings WHERE id=20')).toArray()[0].bytes;
    const output = await new GetLayerUseCase(conn).exec(await process());
    expect(output.features.map(feature => feature.id)).toEqual([20]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 10.*invalid geometry/));
    expect((await conn.query('SELECT ST_AsWKB((ST_Dump(geometry)[1]).geom) AS bytes FROM autk.buildings')).toArray()[0].bytes).toEqual(original);
  });

  it('rolls back an executed replacement and cleans the mapping file on failure', async () => {
    await parts();
    const register = vi.spyOn(db, 'registerFileText');
    const drop = vi.spyOn(db, 'dropFile');
    const query = conn.query.bind(conn);
    vi.spyOn(conn, 'query').mockImplementation(async sql => {
      const result = await query(sql);
      if (sql.includes('WITH indexed_parts')) throw new Error('Simulated failure after replacement');
      return result;
    });
    await expect(process()).rejects.toThrow('Simulated failure after replacement');
    const rows = (await query('SELECT id FROM autk.buildings ORDER BY id')).toArray();
    expect(rows.map(row => row.id)).toEqual([10n, 20n]);
    const columns = getColumnsFromDuckDbTableDescribe((await query('DESCRIBE autk.buildings')).toArray());
    expect(columns.some(column => column.name === 'building_id')).toBe(false);
    expect(register).toHaveBeenCalledOnce();
    expect(drop).toHaveBeenCalledWith(register.mock.calls[0][0]);
  });

  it.each(['NULL', "ST_GeomFromText('POLYGON EMPTY')", "ST_GeomFromText('LINESTRING(0 0,1 1)')"])(
    'logs unusable geometry %s and exports an empty layer when nothing valid remains', async geometry => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await conn.query(`INSERT INTO autk.buildings VALUES (10, '{"height":12}', ${geometry})`);
      const table = await process();
      expect((await new GetLayerUseCase(conn).exec(table)).features).toEqual([]);
      expect(table.columns).toContainEqual({ name: 'building_id', type: 'BIGINT' });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping OSM building part 10.*geometry/));
    },
  );
});
