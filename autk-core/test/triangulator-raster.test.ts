import type { FeatureCollection, Geometry } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TriangulatorRaster } from '../src/triangulator-raster';

afterEach(() => vi.restoreAllMocks());

describe('TriangulatorRaster', () => {
  it('builds a translated textured quad', () => {
    const collection: FeatureCollection<Geometry | null> = {
      type: 'FeatureCollection',
      features: [],
      bbox: [10, 20, 30, 50],
    };

    const [meshes, components] = TriangulatorRaster.buildMesh(collection, [5, 10]);

    expect(Array.from(meshes[0].position)).toEqual([5, 10, 25, 10, 25, 40, 5, 40]);
    expect(Array.from(meshes[0].texCoord ?? [])).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(Array.from(meshes[0].indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(components).toEqual([{ nPoints: 4, nTriangles: 2, featureIndex: 0 }]);
  });

  it('returns no geometry when the bounding box is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const collection: FeatureCollection<Geometry | null> = {
      type: 'FeatureCollection',
      features: [],
    };

    expect(TriangulatorRaster.buildMesh(collection, [0, 0])).toEqual([[], []]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
