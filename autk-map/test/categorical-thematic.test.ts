import type { FeatureCollection, Geometry } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { ColorMap, ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import type { ColorMapConfig } from '@urban-toolkit/autk-core';

/** Features whose `properties.cluster` holds each of `clusters`. */
function collectionOf(clusters: (number | string)[]): FeatureCollection<Geometry | null> {
  return {
    type: 'FeatureCollection',
    features: clusters.map((cluster) => ({ type: 'Feature', geometry: null, properties: { cluster } })),
  };
}

/**
 * Colors a layer of `clusters` under `interpolator` through the real
 * updateThematic, without initializing DOM/WebGPU state: the thematic value
 * each feature gets, which the shader reads, and the legend's labels.
 */
function colorByCluster(clusters: (number | string)[], interpolator: ColorMapInterpolator, patch?: Partial<ColorMapConfig>) {
  const map = Object.create(AutkMap.prototype) as any;
  const layer = {
    layerInfo: { typeLayer: 'polygons' },
    components: clusters.map((_, featureIndex) => ({ featureIndex })),
    layerRenderInfo: { colormap: { config: patch ?? {
      interpolator,
      domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
    } } },
    loadThematic: vi.fn(() => true),
    updateLayerRenderInfo: vi.fn(),
    makeLayerDataDirty: vi.fn(),
  };
  map._layerManager = { searchByLayerId: () => layer };
  map._ui = { refreshLegend: vi.fn() };
  map.updateThematic('clusters', { collection: collectionOf(clusters), property: 'properties.cluster' });
  const thematic = layer.loadThematic.mock.calls[0][0] as { value: number; valid: number }[];
  return {
    values: thematic.map((entry) => entry.value),
    labels: layer.updateLayerRenderInfo.mock.calls[0][0].colormap.computedLabels as string[],
    valid: thematic.map((entry) => entry.valid),
  };
}

describe('numbers colored by a categorical color map', () => {
  it('give each feature the index of its legend label, not the number itself', () => {
    expect(colorByCluster([3, 1, 2, 1], ColorMapInterpolator.CAT_TABLEAU10)).toEqual({
      values: [0, 1, 2, 1],
      labels: ['3', '1', '2'],
      valid: [1, 1, 1, 1],
    });
  });

  it('are colored as the same categories written as text', () => {
    expect(colorByCluster([8, 1, 7, 2], ColorMapInterpolator.CAT_TABLEAU10).values)
      .toEqual(colorByCluster(['h', 'a', 'g', 'b'], ColorMapInterpolator.CAT_TABLEAU10).values);
  });

  it('maps numeric codes to the same short palette as scalar rasters and flags unknown codes', () => {
    const interpolator = ColorMapInterpolator.CAT_TABLEAU10;
    const colors = ['#ff0000', '#0000ff'] as const;
    const { values, labels, valid } = colorByCluster([30, 0, 10, 99], interpolator, {
      type: 'categorical',
      domainSpec: { type: ColorMapDomainStrategy.USER, params: [0, 10, 20, 30] },
      colors,
    });
    expect(labels).toEqual(['0', '10', '20', '30']);
    expect(valid).toEqual([1, 1, 1, 0]);
    const colorOf = ColorMap.getColorFunction({ type: 'categorical', colors }, labels);
    expect(values.filter((_, i) => valid[i]).map(index => ColorMap.rgbToHex(colorOf(index / (labels.length - 1)))))
      .toEqual(['#0000ff', '#ff0000', '#0000ff']);
  });

  it('keep their values under a sequential color map', () => {
    expect(colorByCluster([3, 1, 2, 1], ColorMapInterpolator.SEQ_VIRIDIS).values).toEqual([3, 1, 2, 1]);
  });
});
