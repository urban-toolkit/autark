import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ColorMap,
  ColorMapDomainStrategy,
  ColorMapInterpolator,
  DEFAULT_TRANSFER_FUNCTION,
  buildTransferContext,
  computeAlphaByte,
} from '@urban-toolkit/autk-core';
import type { ResolvedDomain, TransferFunction } from '@urban-toolkit/autk-core';
import { RasterLayer } from '../src/layer-raster';
import { AutkMap } from '../src/map';

afterEach(() => {
  vi.restoreAllMocks();
});

const WIDTH = 8;
const HEIGHT = 6;

/** A ramp from about -3.3 to 7.55, with no-data cells (NaN) in three corners. */
function ramp(): Float32Array {
  const values = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0; i < values.length; i++) {
    values[i] = (i % WIDTH) * 1.25 - 4 + Math.floor(i / WIDTH) * 0.7;
  }
  values[0] = NaN;
  values[WIDTH - 1] = NaN;
  values[values.length - 1] = NaN;
  return values;
}

/** The domain `AutkMap.updateRaster` resolves for a raster before loading it. */
function minMax(values: Float32Array, interpolator: ColorMapInterpolator): ResolvedDomain {
  return ColorMap.resolveDomainFromData(values, { interpolator, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } });
}

/**
 * The RGBA `loadRaster` wrote when it called `ColorMap.getColor` once per
 * cell: the same domain and transfer context, and one call per cell that has
 * a value. A cell with no data is transparent black.
 */
function perCellRgba(
  values: Float32Array,
  interpolator: ColorMapInterpolator,
  computedDomain?: ResolvedDomain,
  transferFunction: TransferFunction = {},
): Float32Array {
  const valid = Array.from(values).filter((value) => !isNaN(value));
  const numeric = Array.isArray(computedDomain)
    && computedDomain.length > 0
    && computedDomain.every((value) => typeof value === 'number')
    ? computedDomain as number[]
    : null;
  const inDomain = numeric
    ? valid.filter((value) => value >= numeric[0] && value <= numeric[numeric.length - 1])
    : valid;
  const context = buildTransferContext(
    inDomain.length > 0 ? inDomain : valid,
    { ...DEFAULT_TRANSFER_FUNCTION, ...transferFunction },
  );
  const rgba = new Float32Array(values.length * 4);
  if (context.validCount === 0) return rgba;
  const domain = (numeric ?? [context.min, context.max]) as [number, number] | [number, number, number];
  values.forEach((value, i) => {
    if (isNaN(value)) return;
    const color = ColorMap.getColor(value, interpolator, domain);
    rgba.set([color.r, color.g, color.b, computeAlphaByte(value, context)], i * 4);
  });
  return rgba;
}

/** A raster layer that has loaded *values*, as `AutkMap.updateRaster` loads them. */
function loadedLayer(
  values: Float32Array,
  interpolator: ColorMapInterpolator,
  computedDomain?: ResolvedDomain,
  transferFunction?: TransferFunction,
): RasterLayer {
  const layer = new RasterLayer(
    { id: 'raster', typeLayer: 'raster' },
    {
      opacity: 1,
      colormap: {
        config: { interpolator, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } },
        computedDomain,
      },
    },
    { geometry: [], components: [], rasterResX: WIDTH, rasterResY: HEIGHT },
  );
  if (transferFunction) layer.setTransferFunction(transferFunction);
  layer.loadRaster(values);
  return layer;
}

/** The bytes of a float array, so two rasters compare byte for byte. */
function bytesOf(values: Float32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}

describe('raster layer colors', () => {
  const cases: Array<[string, Float32Array, ColorMapInterpolator, ResolvedDomain | undefined, TransferFunction | undefined]> = [
    ['viridis over its min-max domain', ramp(), ColorMapInterpolator.SEQ_VIRIDIS,
      minMax(ramp(), ColorMapInterpolator.SEQ_VIRIDIS), undefined],
    ['reds with no domain resolved yet', ramp(), ColorMapInterpolator.SEQ_REDS, undefined, undefined],
    ['turbo over a reversed domain', ramp(), ColorMapInterpolator.SEQ_TURBO, [7.5, -3], undefined],
    ['blues over a domain narrower than the values', ramp(), ColorMapInterpolator.SEQ_BLUES, [-1, 3], undefined],
    ['red-blue over its min-max domain', ramp(), ColorMapInterpolator.DIV_RED_BLUE,
      minMax(ramp(), ColorMapInterpolator.DIV_RED_BLUE), undefined],
    ['red-blue centered on zero', ramp(), ColorMapInterpolator.DIV_RED_BLUE, [-3, 0, 7.5], undefined],
    ['spectral, reversed and centered on zero', ramp(), ColorMapInterpolator.DIV_SPECTRAL, [7.5, 0, -3], undefined],
    ['viridis with a linear, gamma-shaped opacity', ramp(), ColorMapInterpolator.SEQ_VIRIDIS,
      minMax(ramp(), ColorMapInterpolator.SEQ_VIRIDIS), { mode: 'linear', opacityMin: 0.2, opacityMax: 0.9, gamma: 2 }],
    ['magma with near-zero opacity', ramp(), ColorMapInterpolator.SEQ_MAGMA,
      minMax(ramp(), ColorMapInterpolator.SEQ_MAGMA), { mode: 'near-zero', zeroCenter: 1 }],
  ];

  it.each(cases)('colors %s as one ColorMap.getColor call per cell did', (_label, values, interpolator, domain, transfer) => {
    const expected = perCellRgba(values, interpolator, domain, transfer);
    expect(expected.some((channel) => channel !== 0)).toBe(true);

    const layer = loadedLayer(values, interpolator, domain, transfer);

    expect(bytesOf(layer.rasterData)).toEqual(bytesOf(expected));
  });

  it('maps numeric class codes through the configured domain and recolors without reloading', () => {
    const values = new Float32Array([30, 0, 10, 99, NaN, Infinity]);
    const layer = new RasterLayer({ id: 'cover', typeLayer: 'raster' }, {
      opacity: 1,
      colormap: { config: { interpolator: ColorMapInterpolator.SEQ_REDS, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } } },
    }, { geometry: [], components: [], rasterResX: 6, rasterResY: 1, raster: values });
    const map = Object.assign(Object.create(AutkMap.prototype) as AutkMap, {
      _layerManager: { searchByLayerId: () => layer },
      _ui: { refreshLegend: vi.fn() },
    });
    map.updateColorMap('cover', { colorMap: {
      type: 'categorical',
      domainSpec: { type: ColorMapDomainStrategy.USER, params: [0, 10, 20, 30] },
      colors: ['#ff0000', '#0000ff'],
    } });
    expect(layer.layerRenderInfo.colormap.computedLabels).toEqual(['0', '10', '20', '30']);
    expect([...layer.rasterData]).toEqual([
      0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    map.updateColorMap('cover', { colorMap: { type: 'categorical', colors: ['#00ff00'] } });
    expect(layer.rasterValues).toBe(values);
    expect([...layer.rasterData.slice(0, 12)]).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
    map.updateColorMap('cover', { colorMap: { interpolator: ColorMapInterpolator.CAT_SET1 } });
    expect(layer.layerRenderInfo.colormap.config.colors).toBeUndefined();
    expect([...layer.rasterData.slice(0, 4)]).toEqual([152, 78, 163, 255]);
  });

  it('infers raster categories in first-seen order without NoData', () => {
    expect(minMax(new Float32Array([30, NaN, 10, 30, Infinity, 0]), ColorMapInterpolator.CAT_SET1))
      .toEqual(['30', '10', '0']);
  });

  it('leaves a raster with no values transparent', () => {
    const layer = loadedLayer(new Float32Array(WIDTH * HEIGHT).fill(NaN), ColorMapInterpolator.SEQ_VIRIDIS, [0, 1]);
    expect(bytesOf(layer.rasterData)).toEqual(bytesOf(new Float32Array(WIDTH * HEIGHT * 4)));
  });

  it('builds the color scale once per raster, not once per cell', () => {
    const values = ramp();
    const domain = minMax(values, ColorMapInterpolator.SEQ_VIRIDIS);
    const builds = vi.spyOn(ColorMap as any, 'buildInterpolator');

    const layer = loadedLayer(values, ColorMapInterpolator.SEQ_VIRIDIS, domain);
    expect(builds).toHaveBeenCalledTimes(1);

    layer.loadRaster(values);
    expect(builds).toHaveBeenCalledTimes(2);
  });
});
