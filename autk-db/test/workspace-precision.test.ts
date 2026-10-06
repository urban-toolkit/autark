import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { FeatureCollection, Geometry } from 'geojson';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/back-bay-reclip.json';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({ loadDb: async () => {
  const { loadDb } = await import('../src/duckdb-node');
  const engine = await loadDb(); engines.push(engine); return engine;
} }));
import { AutkDb } from '../src/db';

let db: AutkDb;
beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { for (const engine of engines) await engine.terminate(); vi.unstubAllGlobals(); });

const surface: FeatureCollection = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: {}, geometry: fixture.surface as Geometry },
] };
const park: FeatureCollection = { type: 'FeatureCollection', features: [
  { type: 'Feature', id: 165358914, properties: { leisure: 'park' }, geometry: fixture.park as Geometry },
] };

describe('workspace vector precision', () => {
  it('reproduces #106 with the unnormalized exported geometries', async () => {
    const conn = (db as any).conn;
    await expect(conn.query(`SELECT ST_Intersection(
      ST_MakeValid(ST_GeomFromGeoJSON('${JSON.stringify(fixture.park)}')),
      ST_MakeValid(ST_GeomFromGeoJSON('${JSON.stringify(fixture.surface)}')))`)).rejects.toThrow(/TopologyException/);
  });

  it('loads and reimports the #106 surface and park without retry, preserving identity and grid', async () => {
    await db.setWorkspace('precision_source');
    await db.loadGeojson({ geojsonObject: surface, outputTableName: 'surface', layerType: 'surface', coordinateFormat: 'EPSG:3395' });
    await db.loadGeojson({ geojsonObject: park, outputTableName: 'parks', layerType: 'parks', coordinateFormat: 'EPSG:3395' });
    const outputSurface = await db.getLayer('surface');
    const outputPark = await db.getLayer('parks');
    expect(outputPark.features).toHaveLength(1);
    expect(outputPark.features[0].id).toBe(165358914);
    await db.setWorkspace('precision_target');
    await db.loadGeojson({ geojsonObject: outputSurface, outputTableName: 'surface', layerType: 'surface', coordinateFormat: 'EPSG:3395' });
    await db.loadGeojson({ geojsonObject: outputPark, outputTableName: 'parks', layerType: 'parks', coordinateFormat: 'EPSG:3395' });
    const reimported = (await db.getLayer('parks')).features;
    expect(reimported).toHaveLength(1);
    expect(reimported[0].id).toBe(outputPark.features[0].id);
    expect(reimported[0].properties).toEqual(outputPark.features[0].properties);
    const row = (await (db as any).conn.query(`SELECT ST_IsValid(geometry) valid_geometry,
      ST_Equals(geometry, ST_GeomFromGeoJSON('${JSON.stringify(outputPark.features[0].geometry)}')) same_geometry,
      ST_Equals(geometry, ST_ReducePrecision(geometry, 0.01)) on_grid FROM precision_target.parks`)).toArray()[0];
    expect(row.valid_geometry).toBe(true); expect(row.on_grid).toBe(true); expect(row.same_geometry).toBe(true);
  });

  it.each(['geojson', 'json', 'csv'])('transforms %s input before applying the same centimetre grid', async source => {
    await db.setWorkspace(`precision_${source}`);
    if (source === 'geojson') await db.loadGeojson({ outputTableName: 'points', geojsonObject: {
      type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-74.00123456, 40.70123456] } }],
    } });
    else if (source === 'json') await db.loadJson({ outputTableName: 'points', jsonObject: [{ Longitude: -74.00123456, Latitude: 40.70123456 }], geometryColumns: true });
    else await db.loadCsv({ outputTableName: 'points', csvObject: [['Longitude', 'Latitude'], [-74.00123456, 40.70123456]], geometryColumns: true });
    const geometry = (await db.getLayer('points')).features[0].geometry;
    expect(geometry.type).toBe('Point');
    if (geometry.type !== 'Point') throw new Error('Expected point');
    for (const coordinate of geometry.coordinates) expect(coordinate * 100).toBeCloseTo(Math.round(coordinate * 100), 4);
    expect(geometry.coordinates[0]).toBeLessThan(-8_000_000);
  });

  it('normalizes updated vectors and SQL-created vector layers in workspace coordinates', async () => {
    await db.setWorkspace('precision_updates');
    await db.loadGeojson({ outputTableName: 'points', coordinateFormat: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection', features: [{ type: 'Feature', id: 'point', properties: {}, geometry: { type: 'Point', coordinates: [1.234, 5.678] } }],
    } });
    await db.updateTable({ tableName: 'points', strategy: 'update', idColumn: 'geojson_id', data: {
      type: 'FeatureCollection', features: [{ type: 'Feature', id: 'point', properties: {}, geometry: { type: 'Point', coordinates: [1.236, 5.674] } }],
    } });
    expect((await db.getLayer('points')).features[0].geometry).toEqual({ type: 'Point', coordinates: [1.24, 5.67] });
    await db.setWorkspace('precision_sql');
    await db.rawQuery({ query: "SELECT ST_Point(1.234, 5.678) geometry, '{}'::JSON properties", output: { type: 'CREATE_TABLE', tableName: 'points', tableType: 'points' } });
    expect((await db.getLayer('points')).features[0].geometry).toEqual({ type: 'Point', coordinates: [1.23, 5.68] });
  });

  it.each(['geojson', 'json', 'csv'])('rejects a collapsed %s input without leaving a table or metadata', async source => {
    await db.setWorkspace(`precision_empty_${source}`);
    const wkt = 'POLYGON((0 0,0.003 0,0.003 0.003,0 0.003,0 0))';
    const load = source === 'geojson'
      ? db.loadGeojson({ outputTableName: 'tiny', coordinateFormat: 'EPSG:3395', geojsonObject: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.003, 0], [0.003, 0.003], [0, 0.003], [0, 0]]] } },
      ] } })
      : source === 'json'
        ? db.loadJson({ outputTableName: 'tiny', jsonObject: [{ wkt }], geometryColumns: { wktColumnName: 'wkt', coordinateFormat: 'EPSG:3395' } })
        : db.loadCsv({ outputTableName: 'tiny', csvObject: [['wkt'], [wkt]], geometryColumns: { wktColumnName: 'wkt', coordinateFormat: 'EPSG:3395' } });
    await expect(load).rejects.toThrow(/precisionGrid.*collapses/);
    expect(db.getTablesMetadata()).toEqual([]);
    expect((await (db as any).conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='precision_empty_${source}' AND table_name='tiny'`)).numRows).toBe(0);
  });

  it('uses the explicit degree grid for geographic workspaces', async () => {
    await db.setWorkspace('precision_degrees', { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-7 });
    await db.loadGeojson({ outputTableName: 'points', geojsonObject: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-74.00123456, 40.70123456] } },
    ] } });
    const geometry = (await db.getLayer('points')).features[0].geometry;
    expect(geometry).toMatchObject({ type: 'Point' });
    if (geometry.type !== 'Point') throw new Error('Expected point');
    expect(geometry.coordinates[0]).toBeCloseTo(-74.0012346, 7);
    expect(geometry.coordinates[1]).toBeCloseTo(40.7012346, 7);
  });

  it('normalizes overlapping building parts independently without losing geometryIndex or attributes', async () => {
    await db.setWorkspace('precision_parts');
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{
      type: 'Feature', id: 'building', properties: { parts: [{ geometryIndex: 0, height: 11 }, { geometryIndex: 1, height: 22 }] },
      geometry: { type: 'GeometryCollection', geometries: [
        { type: 'Polygon', coordinates: [[[0.004, 0.004], [10.004, 0.004], [10.004, 10.004], [0.004, 10.004], [0.004, 0.004]]] },
        { type: 'Polygon', coordinates: [[[5.004, 0.004], [15.004, 0.004], [15.004, 10.004], [5.004, 10.004], [5.004, 0.004]]] },
      ] },
    }] };
    await db.loadGeojson({ geojsonObject: collection, outputTableName: 'buildings', layerType: 'buildings', coordinateFormat: 'EPSG:3395' });
    const feature = (await db.getLayer('buildings')).features[0];
    expect(feature.id).toBe('building');
    expect(feature.properties?.parts).toEqual(collection.features[0].properties?.parts);
    expect(feature.geometry.type).toBe('GeometryCollection');
    if (feature.geometry.type !== 'GeometryCollection') throw new Error('Expected parts');
    expect(feature.geometry.geometries).toHaveLength(2);
    for (const [i, component] of feature.geometry.geometries.entries()) {
      const row = (await (db as any).conn.query(`SELECT ST_Equals(ST_GeomFromGeoJSON('${JSON.stringify(component)}'),
        ST_GeomFromText('POLYGON((${i * 5} 0,${10 + i * 5} 0,${10 + i * 5} 10,${i * 5} 10,${i * 5} 0))')) same_part`)).toArray()[0];
      expect(row.same_part).toBe(true);
    }
    await db.updateTable({ tableName: 'buildings', idColumn: 'geojson_id', strategy: 'update', data: collection });
    expect((await db.getLayer('buildings')).features[0].properties?.parts).toEqual(collection.features[0].properties?.parts);
  });

  it('rejects a collapsed indexed part and restores the previous table and metadata', async () => {
    await db.setWorkspace('precision_collapse');
    await db.loadGeojson({ outputTableName: 'buildings', layerType: 'buildings', coordinateFormat: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection', features: [{ type: 'Feature', id: 'original', properties: {},
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }],
    } });
    const metadata = structuredClone(db.getTablesMetadata());
    await expect(db.loadGeojson({ outputTableName: 'buildings', layerType: 'buildings', coordinateFormat: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection', features: [{ type: 'Feature', id: 'tiny', properties: {},
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.003, 0], [0.003, 0.003], [0, 0.003], [0, 0]]] } }],
    } })).rejects.toThrow(/precisionGrid.*building part/);
    expect(db.getTablesMetadata()).toEqual(metadata);
    expect((await db.getLayer('buildings')).features.map(feature => feature.id)).toEqual(['original']);
  });

  it('rolls back a failed GeoJSON load and does not retry or register a partial layer', async () => {
    await db.setWorkspace('precision_load_failure');
    await db.loadGeojson({ geojsonObject: surface, outputTableName: 'surface', layerType: 'surface', coordinateFormat: 'EPSG:3395' });
    const metadata = structuredClone(db.getTablesMetadata());
    const conn = (db as any).conn;
    const query = conn.query.bind(conn);
    let attempts = 0;
    vi.spyOn(conn, 'query').mockImplementation(async (sql: any) => {
      const result = await query(sql);
      if (sql.includes('SET geometry =') && sql.includes('ST_Intersection')) { attempts++; throw new Error('Injected crop failure'); }
      return result;
    });
    await expect(db.loadGeojson({ geojsonObject: park, outputTableName: 'parks', layerType: 'parks', coordinateFormat: 'EPSG:3395' }))
      .rejects.toThrow('Injected crop failure');
    expect(attempts).toBe(1);
    expect(db.getTablesMetadata()).toEqual(metadata);
    expect((await query("SELECT table_name FROM information_schema.tables WHERE table_schema='precision_load_failure' AND table_name='parks'")).numRows).toBe(0);
  });

  it('rolls back a failed crop instead of retaining a deleted row or a partially updated geometry', async () => {
    await db.setWorkspace('precision_rollback');
    const conn = (db as any).conn;
    await conn.query(`CREATE TABLE precision_rollback.mask AS SELECT ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))') geometry;
      CREATE TABLE precision_rollback.roads AS SELECT ST_GeomFromText('LINESTRING(5 5,15 5)') geometry
      UNION ALL SELECT ST_GeomFromText('LINESTRING(20 20,30 30)');`);
    const before = (await conn.query('SELECT ST_AsWKB(geometry) bytes FROM precision_rollback.roads')).toArray();
    const query = conn.query.bind(conn);
    vi.spyOn(conn, 'query').mockImplementation(async (sql: any) => {
      const result = await query(sql);
      if (sql.includes('SET geometry =') && sql.includes('ST_Intersection')) throw new Error('Injected crop failure');
      return result;
    });
    await expect((db as any).clipLayerToLayer('roads', 'mask', 'precision_rollback')).rejects.toThrow('Injected crop failure');
    expect((await query('SELECT ST_AsWKB(geometry) bytes FROM precision_rollback.roads')).toArray()).toEqual(before);
  });
});
