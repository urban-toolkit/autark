import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { loadDb } from '../src/duckdb-node';

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

/** A 2x2 GeoTIFF whose extent is x 10 to 12, y 20 to 22, away from the origin. */
function geotiff() {
  return writeArrayBuffer(new Float32Array([1, 2, 3, 4]), { width: 2, height: 2,
    BitsPerSample: [32], SampleFormat: [3], SamplesPerPixel: 1, GeographicTypeGeoKey: 4326,
    ModelTiepoint: [0, 0, 0, 10, 22, 0], ModelPixelScale: [1, 1, 0] });
}

async function workspace() {
  await db.setWorkspace(`geotiff_layer_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
}

describe('getLayer on a GeoTIFF table', () => {
  it('returns the raster with its own extent when the workspace has no bounding box yet', async () => {
    await workspace();
    await db.loadGeoTiff({ geotiffArrayBuffer: geotiff(), outputTableName: 'image' });
    const raster = await db.getLayer('image');
    expect(raster.bbox).toEqual([10, 20, 12, 22]);
    expect(raster.features).toHaveLength(1);
    expect(raster.features[0].geometry).toBeNull();
    expect(raster.features[0].properties?.rasterResX).toBe(2);
  });

  it('keeps the raster extent instead of the workspace bounding box', async () => {
    await workspace();
    await db.loadGeojson({ outputTableName: 'points', coordinateFormat: 'EPSG:4326', geojsonObject: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
    } });
    await db.loadGeoTiff({ geotiffArrayBuffer: geotiff(), outputTableName: 'image' });
    expect((await db.getLayer('image')).bbox).toEqual([10, 20, 12, 22]);
  });
});

describe('loadGeoTiff resampling', () => {
  it('warns when the image has more pixels than the cell limit', async () => {
    await workspace();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadGeoTiff({ geotiffArrayBuffer: geotiff(), outputTableName: 'image', maxRasterCells: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/'image' has 2x2 pixels.*resampled to 1x1.*maxRasterCells/));
  });

  it('stays quiet when the image fits', async () => {
    await workspace();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.loadGeoTiff({ geotiffArrayBuffer: geotiff(), outputTableName: 'image' });
    expect(warn).not.toHaveBeenCalled();
  });
});
