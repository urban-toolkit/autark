import type { FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import { computeOrigin } from '../src/utils-geojson';

const raster = (bbox?: number[]): FeatureCollection => ({
  type: 'FeatureCollection',
  ...(bbox ? { bbox } : {}),
  features: [{ type: 'Feature', geometry: null, properties: { rasterResX: 2, rasterResY: 2 } }],
} as FeatureCollection);

describe('computeOrigin', () => {
  it('centers on the feature geometries', () => {
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20] } },
    ] };
    expect(computeOrigin(fc)).toEqual([5, 10]);
  });

  it('prefers geometry over a declared bbox', () => {
    const fc: FeatureCollection = { type: 'FeatureCollection', bbox: [100, 100, 200, 200], features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [2, 4] } },
    ] };
    expect(computeOrigin(fc)).toEqual([2, 4]);
  });

  it('falls back to the declared bbox for a raster whose features have no geometry', () => {
    expect(computeOrigin(raster([294741, 715236, 295963, 716451]))).toEqual([295352, 715843.5]);
  });

  it('reads the horizontal extent of a 3D bbox', () => {
    expect(computeOrigin(raster([0, 0, -5, 10, 20, 5]))).toEqual([5, 10]);
  });

  it('returns [0, 0] when there is neither geometry nor a usable bbox', () => {
    expect(computeOrigin(raster())).toEqual([0, 0]);
    expect(computeOrigin(raster([0, 0, NaN, 1]))).toEqual([0, 0]);
    expect(computeOrigin(raster([1, 2, 3]))).toEqual([0, 0]);
  });
});
