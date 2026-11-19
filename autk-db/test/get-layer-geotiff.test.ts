import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import type { LoadGeoTiffParams } from '../src/use-cases/load-geotiff/interfaces';
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

describe('categorical RGB import', () => {
  const palette = {
    type: 'categorical',
    domainSpec: { type: ColorMapDomainStrategy.USER, params: ['Water', 'Forest'] },
    colors: ['#0000ff', '#00ff00'],
  } satisfies NonNullable<LoadGeoTiffParams['categoricalRgb']>;
  const rgb = () => writeArrayBuffer(new Uint8Array([0, 0, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255]), {
    width: 2, height: 2, BitsPerSample: [8, 8, 8], SamplesPerPixel: 3, PhotometricInterpretation: 2,
    GeographicTypeGeoKey: 4326, ModelTiepoint: [0, 0, 0, 10, 22, 0], ModelPixelScale: [1, 1, 0],
  });

  it('exposes one class band, preserves its category names and bounds, and warns about unmatched pixels', async () => {
    await workspace();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = { geotiffArrayBuffer: rgb(), outputTableName: 'classes', categoricalRgb: palette };
    await db.loadGeoTiff(input);
    const result = await db.getRaster('classes');
    const props = result.features[0].properties!;
    expect(result.bbox).toEqual([10, 20, 12, 22]);
    expect(props.bands).toEqual([{ id: 'band_1', label: 'band_1', categories: ['Water', 'Forest'] }]);
    expect([...props.band_1]).toEqual([1, 0, 0, NaN]);
    expect(props.band_2).toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('1 unmatched RGB pixel'));
  });

  it('uses nearest-neighbor for categorical downsizing', async () => {
    await workspace();
    const input = { geotiffArrayBuffer: rgb(), outputTableName: 'classes', categoricalRgb: palette, maxRasterCells: 1 };
    await db.loadGeoTiff(input);
    const props = (await db.getRaster('classes')).features[0].properties!;
    expect(props.rasterResX).toBe(1);
    expect([...props.band_1]).toEqual([0]);
  });

  it('rejects ambiguous palettes and imports with no matching pixels', async () => {
    await workspace();
    const input = { geotiffArrayBuffer: rgb(), outputTableName: 'classes' };
    await expect(db.loadGeoTiff({ ...input, categoricalRgb: { ...palette, colors: ['#00f', '#0000ff'] } }))
      .rejects.toThrow(/distinct source colors/);
    await expect(db.loadGeoTiff({ ...input, categoricalRgb: { ...palette, colors: ['#fff', '#000'] } }))
      .rejects.toThrow(/No pixels matched/);
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
