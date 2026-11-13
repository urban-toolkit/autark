import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { RasterLayer } from '../src/layer-raster';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

afterEach(() => vi.restoreAllMocks());

const raster = (bands: Record<string, ArrayLike<number>>): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: null, properties: { rasterResX: 2, rasterResY: 1, ...bands } }],
});

/** An AutkMap holding one raster layer, without DOM or WebGPU state. */
function mapWithRasterLayer() {
  const layer = new RasterLayer({ id: 'image', typeLayer: 'raster', zIndex: 0 }, {
    opacity: 0.5, isColorMap: true,
    colormap: { config: { interpolator: ColorMapInterpolator.SEQ_REDS, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } } },
  }, { geometry: [], components: [], rasterResX: 2, rasterResY: 1 });
  vi.spyOn(layer, 'loadRgbRaster');
  vi.spyOn(layer, 'makeLayerDataDirty');
  vi.spyOn(layer, 'updateLayerRenderInfo');
  vi.spyOn(layer, 'setTransferFunction');
  const map = Object.create(AutkMap.prototype) as any;
  map._layerManager = { searchByLayerId: () => layer, hasOrigin: true };
  map._ui = { refreshLegend: vi.fn(), refreshLayerList: vi.fn() };
  return { map: map as AutkMap, layer, ui: map._ui };
}

const RGB: [string, string, string] = ['band_1', 'band_2', 'band_3'];

describe('updateRaster with three bands', () => {
  it('loads an interleaved RGBA image and skips the color map', () => {
    const { map, layer, ui } = mapWithRasterLayer();
    map.updateRaster('image', {
      collection: raster({ band_1: new Uint8Array([10, 20]), band_2: new Uint8Array([30, 40]), band_3: new Uint8Array([50, 60]) }),
      property: RGB,
      transferFunction: { mode: 'linear' },
    });
    expect(Array.from(layer.loadRgbRaster.mock.calls[0][0])).toEqual([10, 30, 50, 255, 20, 40, 60, 255]);
    expect(layer.makeLayerDataDirty).toHaveBeenCalledOnce();
    expect(layer.rasterMode).toBe('rgb');
    expect(layer.layerRenderInfo.isColorMap).toBe(false);
    expect(layer.rasterValues).toHaveLength(0);
    expect(layer.setTransferFunction).not.toHaveBeenCalled();
    expect(ui.refreshLegend).toHaveBeenCalledWith(layer);
    expect(ui.refreshLayerList).toHaveBeenCalled();
  });

  it('stretches reflectance values with an explicit range', () => {
    const { map, layer } = mapWithRasterLayer();
    map.updateRaster('image', {
      collection: raster({ band_1: [0, 3000], band_2: [1500, 1500], band_3: [3000, 0] }),
      property: RGB,
      rgbRange: [0, 3000],
    });
    const rgba = Array.from(layer.loadRgbRaster.mock.calls[0][0] as Float32Array);
    expect(rgba.slice(0, 4)).toEqual([0, 127.5, 255, 255]);
    expect(rgba.slice(4, 8)).toEqual([255, 127.5, 0, 255]);
  });

  it('warns and leaves the layer alone when a band is missing', () => {
    const { map, layer } = mapWithRasterLayer();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    map.updateRaster('image', { collection: raster({ band_1: [1, 2], band_2: [1, 2] }), property: RGB });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'band_3'"));
    expect(layer.loadRgbRaster).not.toHaveBeenCalled();
  });

  it('warns and leaves the layer alone when the bands differ in length', () => {
    const { map, layer } = mapWithRasterLayer();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    map.updateRaster('image', { collection: raster({ band_1: [1, 2], band_2: [1, 2], band_3: [1] }), property: RGB });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same length'));
    expect(layer.loadRgbRaster).not.toHaveBeenCalled();
  });

  it('restores scalar pixels, legend preference, domain, opacity, and transfer function after an RGB update', () => {
    const { map, layer } = mapWithRasterLayer();
    const collection = raster({ band_1: [10, 20], band_2: [30, 40], band_3: [50, 60] });
    map.updateRaster('image', { collection, property: 'band_1', transferFunction: { mode: 'linear' } });
    const scalar = layer.rasterData.slice();
    map.updateRaster('image', { collection, property: RGB });
    expect(layer.layerRenderInfo.colormap.computedDomain).toBeUndefined();
    expect(layer.layerRenderInfo.colormap.computedLabels).toBeUndefined();
    const rgb = layer.rasterData.slice();
    map.updateColorMap('image', { colorMap: { interpolator: ColorMapInterpolator.SEQ_BLUES } });
    map.updateRenderInfo('image', { isColorMap: true });
    expect(layer.rasterData).toEqual(rgb);
    expect(layer.layerRenderInfo.isColorMap).toBe(false);
    map.updateRaster('image', { collection, property: 'band_1' });
    expect(layer.rasterMode).toBe('scalar');
    expect(layer.layerRenderInfo.isColorMap).toBe(true);
    expect(layer.layerRenderInfo.colormap.computedDomain).toEqual([10, 20]);
    expect(layer.rasterData).toEqual(scalar);
    expect(layer.layerRenderInfo.opacity).toBe(0.5);
  });

  it('keeps a disabled scalar legend disabled after returning from RGB', () => {
    const { map, layer } = mapWithRasterLayer();
    layer.updateLayerRenderInfo({ isColorMap: false });
    const collection = raster({ band_1: [10, 20], band_2: [30, 40], band_3: [50, 60] });
    map.updateRaster('image', { collection, property: RGB });
    map.updateRaster('image', { collection, property: 'band_1' });
    expect(layer.layerRenderInfo.isColorMap).toBe(false);
  });

  it.each([
    { bands: { band_1: [1], band_2: [2], band_3: [3] }, rgbRange: undefined },
    { bands: { band_1: [1, 2, 3], band_2: [1, 2, 3], band_3: [1, 2, 3] }, rgbRange: undefined },
    { bands: { band_1: [1, 2], band_2: [1, 2], band_3: [1, 2] }, rgbRange: [10, 0] },
    { bands: { band_1: [1, 2], band_2: [1, 2], band_3: [1, 2] }, rgbRange: [NaN, 255] },
  ])('preserves scalar state on an invalid RGB grid or range: %j', ({ bands, rgbRange }) => {
    const { map, layer } = mapWithRasterLayer();
    map.updateRaster('image', { collection: raster({ band_1: [10, 20] }), property: 'band_1' });
    const before = layer.rasterData.slice();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    map.updateRaster('image', { collection: raster(bands), property: RGB, rgbRange: rgbRange as [number, number] });
    expect(warn).toHaveBeenCalledOnce();
    expect(layer.rasterData).toEqual(before);
    expect(layer.rasterMode).toBe('scalar');
    expect(layer.layerRenderInfo.colormap.computedDomain).toEqual([10, 20]);
    expect(layer.layerRenderInfo.isColorMap).toBe(true);
  });

  it('preserves RGB pixels and mode when a scalar update has the wrong sample count', () => {
    const { map, layer } = mapWithRasterLayer();
    map.updateRaster('image', { collection: raster({ band_1: [10, 20], band_2: [30, 40], band_3: [50, 60] }), property: RGB });
    const before = layer.rasterData.slice();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    map.updateRaster('image', { collection: raster({ band_1: [1] }), property: 'band_1' });
    expect(layer.rasterMode).toBe('rgb');
    expect(layer.rasterData).toEqual(before);
    expect(layer.layerRenderInfo.isColorMap).toBe(false);
  });
});

describe('loadCollection for a raster layer', () => {
  function loading() {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { hasOrigin: true };
    map._ui = { refreshLayerList: vi.fn() };
    map.createRasterLayer = vi.fn();
    return map as AutkMap & { createRasterLayer: ReturnType<typeof vi.fn> };
  }

  it('passes three bands and the range through to the layer', () => {
    const map = loading();
    const collection = raster({});
    map.loadCollection('image', { collection, type: 'raster', property: RGB, loadConfig: { rgbRange: [0, 3000] } });
    expect(map.createRasterLayer).toHaveBeenCalledWith('image', collection, RGB, [0, 3000]);
  });

  it('still accepts a single band path', () => {
    const map = loading();
    const collection = raster({});
    map.loadCollection('image', { collection, type: 'raster', property: 'band_1' });
    expect(map.createRasterLayer).toHaveBeenCalledWith('image', collection, 'band_1', undefined);
  });

  it('rejects a property that is neither a band path nor three of them', () => {
    const map = loading();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    map.loadCollection('image', { collection: raster({}), type: 'raster', property: ['band_1', 'band_2'] as any });
    expect(error).toHaveBeenCalled();
    expect(map.createRasterLayer).not.toHaveBeenCalled();
  });
});
