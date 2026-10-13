import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadDb } from '../src/duckdb-node';
import { writeArrayBuffer } from 'geotiff';
import { tableFromIPC } from 'apache-arrow';
import { setRasterPayload, getRasterPayload } from '../src/raster-store';
import type { FeatureCollection } from 'geojson';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

let db: AutkDb;
let serial = 0;
beforeAll(async () => {
  native.db = await loadDb(); vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await (db as any)?.conn?.close(); await native.db?.terminate(); vi.unstubAllGlobals(); });

async function setup(features: FeatureCollection['features'], coordinateFormat = 'EPSG:4326', precisionGrid = 1e-10) {
  await db.setWorkspace(`raster_join_${++serial}`, { coordinateFormat, precisionGrid });
  await db.loadGeojson({ outputTableName: 'roots', coordinateFormat, geojsonObject: { type: 'FeatureCollection', features } });
  await db.rawQuery({ query: `SELECT 2 width, 2 height, 0.0 min_x, 0.0 min_y, 2.0 max_x, 2.0 max_y`,
    output: { type: 'CREATE_TABLE', tableName: 'cells', tableType: 'raster' } });
  setRasterPayload(db.getCurrentWorkspace(), 'cells', {
    width: 2, height: 2, originalWidth: 2, originalHeight: 2,
    minX: 0, minY: 0, maxX: 2, maxY: 2, originX: 0, originY: 2, sourceMinX: 0, sourceMinY: 0, resX: 1, resY: 1,
    sourceCrs: coordinateFormat, targetCrs: coordinateFormat,
    bands: [{ id: 'band_1', label: 'first' }, { id: 'band_2', label: 'second' }],
    values: { band_1: new Float32Array([0, 2, 4, NaN]), band_2: new Float32Array([10, 20, 30, 40]) },
  });
}

const feature = (id: number, geometry: FeatureCollection['features'][number]['geometry']) => ({
  type: 'Feature' as const, id, geometry, properties: { keep: id },
});
const point = (x: number, y: number) => ({ type: 'Point' as const, coordinates: [x, y] });
const polygon = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'Polygon' as const,
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

describe('compact raster joins treat cells as an implicit pointset', () => {
  it('aggregates bands at polygon-contained cell centers, ignores NoData and preserves geometry/IDs', async () => {
    const roots = [feature(1, polygon(0, 0, 2, 2)), feature(2, polygon(5, 5, 6, 6))];
    await setup(roots);
    const before = await db.getLayer('roots');
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', groupBy: [
      { column: 'band_1', aggregateFn: 'avg' }, { column: 'band_2', aggregateFn: 'avg' },
      { column: 'band_1', aggregateFn: 'sum' }, { column: 'band_1', aggregateFn: 'min' },
      { column: 'band_1', aggregateFn: 'max' }, { column: 'band_1', aggregateFn: 'count' },
    ] });
    const result = await db.getLayer('roots');
    expect(result.features).toHaveLength(2);
    const inside = result.features.find(f => f.id === 1)!;
    expect(inside.geometry).toEqual(before.features.find(f => f.id === 1)?.geometry);
    expect(inside.properties?.keep).toBe(1);
    expect(inside.properties?.sjoin.avg).toEqual({ 'cells.band_1': 2, 'cells.band_2': 25 });
    expect(inside.properties?.sjoin.sum['cells.band_1']).toBe(6);
    expect(inside.properties?.sjoin.min['cells.band_1']).toBe(0);
    expect(inside.properties?.sjoin.max['cells.band_1']).toBe(4);
    expect(inside.properties?.sjoin.count.cells).toBe(3);
    expect(result.features.find(f => f.id === 2)?.properties?.sjoin.count.cells).toBe(0);
    expect(db.getTablesMetadata().find(t => t.name === 'cells')?.columns.some(c => c.type === 'GEOMETRY')).toBe(false);
  });

  it('near uses root centroids by default and geometry distance when explicitly requested', async () => {
    await setup([feature(1, { type: 'LineString', coordinates: [[0.5, 0.5], [0.5, 1.5]] })]);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0.1 },
      groupBy: [{ column: '*', aggregateFn: 'count' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.count.cells).toBe(0);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0.1, useCentroid: false },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }, { column: '*', aggregateFn: 'count' }] });
    const output = (await db.getLayer('roots')).features[0];
    expect(output.properties?.sjoin.count.cells).toBe(2);
    expect(output.properties?.sjoin.avg['cells.band_1']).toBe(2);
  });

  it('samples only cell centers, including polygon boundaries, not pixel-area overlap', async () => {
    await setup([feature(1, polygon(0, 0, 0.49, 0.49)), feature(2, polygon(0.5, 0.5, 1.5, 1.5))]);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', groupBy: [{ column: '*', aggregateFn: 'count' }] });
    const output = await db.getLayer('roots');
    expect(output.features.find(f => f.id === 1)?.properties?.sjoin.count.cells).toBe(0);
    expect(output.features.find(f => f.id === 2)?.properties?.sjoin.count.cells).toBe(4);
  });

  it('preserves simple matches, collections, weighted counts and normalized numeric aggregates', async () => {
    await setup([feature(1, point(0.5, 0.5)), feature(2, point(1.5, 0.5))]);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0 } });
    const matches = (await db.getLayer('roots')).features.find(f => f.id === 1)?.properties?.sjoin.matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].properties.band_1).toBe(0);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0 }, groupBy: [
      { column: 'band_1', aggregateFn: 'avg', normalize: true }, { column: 'band_1', aggregateFn: 'collect' },
      { column: '*', aggregateFn: 'weighted' },
    ] });
    const result = await db.getLayer('roots');
    expect(result.features.find(f => f.id === 1)?.properties?.sjoin.avg['cells.band_1_norm']).toBe(0);
    expect(result.features.find(f => f.id === 2)?.properties?.sjoin.avg['cells.band_1_norm']).toBe(1);
    expect(result.features[0].properties?.sjoin.collect.cells).toHaveLength(1);
    expect(result.features[0].properties?.sjoin.weighted.cells).toBe(1);
  });

  it.each([['EPSG:4326', 'EPSG:3395', 0], ['EPSG:32631', 'EPSG:4326', 0], ['EPSG:3857', 'EPSG:4326', 21000000]] as const)('transforms cell centers from %s to %s (source x=%s, including CRS/domain fallback)', async (source, target, sourceMinX) => {
    const expected = await db.rawQuery({
      query: `SELECT ST_X(g) x, ST_Y(g) y FROM (SELECT ST_Transform(ST_Point(${sourceMinX + 0.5}, 1.5), '${source}', '${target}', always_xy := true) g)`,
      output: { type: 'RETURN_OBJECT' },
    });
    await setup([feature(1, point((expected as any)[0].x, (expected as any)[0].y))], target);
    const payload = getRasterPayload(db.getCurrentWorkspace(), 'cells')!;
    payload.sourceCrs = source;
    payload.sourceMinX = sourceMinX;
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: target === 'EPSG:4326' ? 1e-9 : 0.01 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.avg['cells.band_1']).toBe(4);
  });

  it('does not lose seam-adjacent cells when the inverse search bbox wraps at the antimeridian', async () => {
    const expected = await db.rawQuery({ query: `SELECT ST_X(g) x, ST_Y(g) y FROM
      (SELECT ST_Transform(ST_Point(179.9985,1.5), 'EPSG:4326', 'EPSG:3395', always_xy := true) g)`,
      output: { type: 'RETURN_OBJECT' } });
    await setup([feature(1, point(expected[0].x, expected[0].y))], 'EPSG:3395');
    const payload = getRasterPayload(db.getCurrentWorkspace(), 'cells')!;
    payload.sourceCrs = 'EPSG:4326'; payload.sourceMinX = 179.998; payload.resX = 0.001;
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 2000 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }, { column: '*', aggregateFn: 'count' }] });
    const output = (await db.getLayer('roots')).features[0];
    expect(output.properties?.sjoin.count.cells).toBe(2);
    expect(output.properties?.sjoin.avg['cells.band_1']).toBe(4);
  });

  it('matches a materialized reference pointset for whole multipart features', async () => {
    await setup([feature(1, { type: 'GeometryCollection', geometries: [polygon(0, 0, 2, 2), polygon(0, 0, 1, 1)] }),
      feature(2, point(0.5, 0.5)), feature(3, point(5, 5))]);
    const params = { tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0.25, useCentroid: false },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' as const }, { column: '*', aggregateFn: 'count' as const },
        { column: '*', aggregateFn: 'weighted' as const }, { column: 'band_2', aggregateFn: 'sum' as const }] };
    await db.spatialQuery(params);
    const raster = await db.getLayer('roots');
    await db.rawQuery({ query: `SELECT ST_Point(x,y) geometry, v::FLOAT band_1, w::FLOAT band_2
      FROM (VALUES (0.5,0.5,0,10), (1.5,0.5,2,20), (0.5,1.5,4,30), (1.5,1.5,NULL,40)) AS p(x,y,v,w)`,
      output: { type: 'CREATE_TABLE', tableName: 'cells', tableType: 'points' } });
    await db.spatialQuery(params);
    const vector = await db.getLayer('roots');
    for (const output of raster.features) {
      expect(output.properties?.sjoin).toEqual(vector.features.find(f => f.id === output.id)?.properties?.sjoin);
    }
  });

  it('cleans up packed temporary arrays after a query failure and preserves roots', async () => {
    await setup([feature(1, point(0.5, 0.5))]);
    const before = await db.getLayer('roots');
    const conn = (db as any).conn;
    vi.spyOn(conn, 'query').mockRejectedValueOnce(new Error('Injected join failure'));
    await expect(db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells',
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] })).rejects.toThrow('Injected join failure');
    expect(await db.getLayer('roots')).toEqual(before);
    const leftovers = await db.rawQuery({ query: `SELECT table_name FROM information_schema.tables WHERE table_schema = '${db.getCurrentWorkspace()}' AND starts_with(table_name, '_autk_raster_join_')`,
      output: { type: 'RETURN_OBJECT' } });
    expect(leftovers).toEqual([]);
  });

  it('supports compact heatmap rasters in the actual workspace CRS', async () => {
    await setup([feature(1, point(0.5, 0.5)), feature(2, point(1.5, 1.5))]);
    await db.buildHeatmap({ tableJoinName: 'roots', outputTableName: 'heat', grid: { rows: 1, columns: 1 },
      near: { distance: 1 }, groupBy: [{ column: '*', aggregateFn: 'count' }] });
    expect(getRasterPayload(db.getCurrentWorkspace(), 'heat')?.sourceCrs).toBe('EPSG:4326');
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'heat', near: { distance: 1 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.avg['heat.band_1']).toBe(2);
  });

  it('transfers only requested bands as one packed row, never pixel geometries', async () => {
    await setup([feature(1, point(0.5, 0.5))]);
    const conn = (db as any).conn;
    const originalInsert = conn.insertArrowFromIPCStream.bind(conn);
    let packed: ReturnType<typeof tableFromIPC> | undefined;
    vi.spyOn(conn, 'insertArrowFromIPCStream').mockImplementation(async (buffer: Uint8Array, options: any) => {
      packed = tableFromIPC(buffer.slice());
      await originalInsert(buffer, options);
    });
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect(packed?.numRows).toBe(1);
    expect(packed?.schema.fields.map(field => field.name)).toEqual(['band_1']);
    expect(packed?.schema.fields[0].type.toString()).toBe('List<Float32>');
  });

  it.each([false, true])('joins a real decoded GeoTIFF, preserving zeros and source array orientation (reversed=%s)', async reversed => {
    const location = reversed ? point(1.5, 0.5) : point(0.5, 1.5);
    await setup([feature(1, location)]);
    const geoReference = reversed ? { ModelTransformation: [-1,0,0,2, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
      : { ModelTiepoint: [0,0,0,0,2,0], ModelPixelScale: [1,1,0] };
    const buffer = writeArrayBuffer(new Float32Array([0, 2, 4, 8]), { width: 2, height: 2,
      BitsPerSample: [32], SampleFormat: [3], SamplesPerPixel: 1, GeographicTypeGeoKey: 4326, ...geoReference });
    await db.loadGeoTiff({ geotiffArrayBuffer: buffer, outputTableName: 'loaded' });
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'loaded', near: { distance: 0 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.avg['loaded.band_1']).toBe(0);
  });

  it('samples resampled grid centers and ignores a declared GeoTIFF NoData sentinel', async () => {
    await setup([feature(1, point(1, 1))]);
    const metadata = { width: 2, height: 2, BitsPerSample: [32], SampleFormat: [3], SamplesPerPixel: 1,
      ModelTiepoint: [0,0,0,0,2,0], ModelPixelScale: [1,1,0], GeographicTypeGeoKey: 4326, GDAL_NODATA: '-9999\0' };
    const buffer = writeArrayBuffer(new Float32Array([0, 2, 4, -9999]), { ...metadata });
    await db.loadGeoTiff({ geotiffArrayBuffer: buffer, outputTableName: 'loaded' });
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'loaded', near: { distance: 2 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.avg['loaded.band_1']).toBe(2);
    const resampled = writeArrayBuffer(new Float32Array([0, 2, 4, 8]), metadata);
    await db.loadGeoTiff({ geotiffArrayBuffer: resampled, outputTableName: 'loaded', maxRasterCells: 1 });
    expect(getRasterPayload(db.getCurrentWorkspace(), 'loaded')?.width).toBe(1);
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'loaded', near: { distance: 0 },
      groupBy: [{ column: 'band_1', aggregateFn: 'avg' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.avg['loaded.band_1'])
      .toBe(getRasterPayload(db.getCurrentWorkspace(), 'loaded')?.values.band_1[0]);
  });

  it('rejects rotated GeoTIFFs rather than treating their bbox as an axis-aligned grid', async () => {
    await setup([feature(1, point(0.5, 0.5))]);
    const buffer = writeArrayBuffer(new Float32Array([1, 2, 3, 4]), { width: 2, height: 2,
      BitsPerSample: [32], SampleFormat: [3], SamplesPerPixel: 1, GeographicTypeGeoKey: 4326,
      ModelTransformation: [1,0.2,0,0, 0,-1,0,2, 0,0,1,0, 0,0,0,1] });
    await expect(db.loadGeoTiff({ geotiffArrayBuffer: buffer, outputTableName: 'loaded' })).rejects.toThrow(/Rotated or sheared/);
  });

  it('keeps cells that move into the search window on the workspace precision grid', async () => {
    await setup([feature(1, point(0, 0))], 'EPSG:3395', 1);
    const payload = getRasterPayload(db.getCurrentWorkspace(), 'cells')!;
    payload.resX = payload.resY = 0.25;
    payload.maxX = payload.maxY = 0.5;
    await db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells', near: { distance: 0 },
      groupBy: [{ column: '*', aggregateFn: 'count' }] });
    expect((await db.getLayer('roots')).features[0].properties?.sjoin.count.cells).toBe(4);
  });

  it('rejects raster roots and missing in-memory payloads explicitly', async () => {
    await setup([feature(1, point(0.5, 0.5))]);
    await expect(db.spatialQuery({ tableRootName: 'cells', tableJoinName: 'roots' })).rejects.toThrow(/vector root/);
    const { deleteRasterPayload } = await import('../src/raster-store');
    deleteRasterPayload(db.getCurrentWorkspace(), 'cells');
    await expect(db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells' })).rejects.toThrow(/Reload the raster/);
  });

  it('rejects unknown bands and does not overwrite roots on failure', async () => {
    await setup([feature(1, point(0.5, 0.5))]);
    const before = await db.getLayer('roots');
    await expect(db.spatialQuery({ tableRootName: 'roots', tableJoinName: 'cells',
      groupBy: [{ column: 'band_99', aggregateFn: 'avg' }] })).rejects.toThrow(/band_99/);
    expect(await db.getLayer('roots')).toEqual(before);
  });
});
