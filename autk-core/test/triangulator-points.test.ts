import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TriangulatorPoints } from '../src/triangulator-points';

const defaultPointSize = TriangulatorPoints.getPointSize();

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

afterEach(() => {
  TriangulatorPoints.setPointSize(defaultPointSize);
  vi.restoreAllMocks();
});

describe('TriangulatorPoints', () => {
  it('packs points in local coordinates with component metadata', () => {
    const data = collection([
      { type: 'Feature', id: 'single', properties: {}, geometry: { type: 'Point', coordinates: [12, 25] } },
      {
        type: 'Feature',
        id: 'multi',
        properties: {},
        geometry: { type: 'MultiPoint', coordinates: [[20, 30], [30, 50]] },
      },
    ]);

    const result = TriangulatorPoints.buildInstances(data, [10, 20]);

    expect(Array.from(result.instances)).toEqual([2, 5, 10, 10, 20, 30]);
    expect(result.components).toMatchObject([
      { nPoints: 1, featureIndex: 0, featureId: 'single' },
      { nPoints: 2, featureIndex: 1, featureId: 'multi' },
    ]);
  });

  it('collects supported GeometryCollection children', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const data = collection([
      {
        type: 'Feature',
        id: 7,
        properties: {},
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            { type: 'Point', coordinates: [1, 2] },
            { type: 'MultiPoint', coordinates: [[3, 4], [5, 6]] },
            { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          ],
        },
      },
    ]);

    const result = TriangulatorPoints.buildInstances(data, [1, 1]);

    expect(Array.from(result.instances)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.components).toMatchObject([{ nPoints: 3, featureIndex: 0, featureId: 7 }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('skips unsupported and missing geometries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const data = collection([
      { type: 'Feature', properties: {}, geometry: null },
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] },
      },
    ]);

    expect(TriangulatorPoints.buildInstances(data, [0, 0])).toEqual({
      instances: new Float32Array(),
      components: [],
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('accepts only finite positive point sizes', () => {
    TriangulatorPoints.setPointSize(12);

    expect(TriangulatorPoints.getPointSize()).toBe(12);
    for (const size of [0, -1, NaN, Infinity]) {
      expect(() => TriangulatorPoints.setPointSize(size)).toThrow();
    }
  });
});
