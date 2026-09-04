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
    const mesh = meshes[0];
    const vertices = Array.from({ length: mesh.position.length / 2 }, (_, index) => [
      mesh.position[index * 2],
      mesh.position[index * 2 + 1],
      mesh.texCoord![index * 2],
      mesh.texCoord![index * 2 + 1],
    ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    expect(vertices).toEqual([
      [5, 10, 0, 0],
      [5, 40, 0, 1],
      [25, 10, 1, 0],
      [25, 40, 1, 1],
    ]);
    expect(mesh.indices).toHaveLength(6);
    expect(new Set(mesh.indices)).toEqual(new Set([0, 1, 2, 3]));
    expect(components).toEqual([{
      nPoints: mesh.position.length / 2,
      nTriangles: mesh.indices!.length / 3,
      featureIndex: 0,
    }]);
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
