import type { FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import { resolveRenderViewpoints } from '../src/viewpoint';

// The CPU-side camera-generation boundary; no WebGPU is mocked or dispatched.
describe('viewpoints on original building parts', () => {
  it('keeps source identity while generating viewpoints at each part height', () => {
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{
      type: 'Feature', id: 'building-a',
      geometry: { type: 'GeometryCollection', geometries: [
        { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
        { type: 'Polygon', coordinates: [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]] },
      ] }, properties: { height: 12, parts: [{ geometryIndex: 1, height: 25 }] },
    }] };
    const result = resolveRenderViewpoints({ collection, strategy: { type: 'building-windows', floors: 2 } });
    expect(result.windows?.length).toBeGreaterThan(0);
    expect(result.samples).toHaveLength(result.windows!.length * 3);
    result.windows!.forEach((window, index) => {
      const samples = result.samples.filter(sample => sample.collectionIndex === index);
      expect(samples).toHaveLength(3);
      expect(samples.every(sample => sample.eye.every((value, axis) => value === window.center[axis]))).toBe(true);
    });
    expect(new Set(result.windows!.map(w => w.sourceFeatureIndex))).toEqual(new Set([0]));
    expect(new Set(result.windows!.map(w => w.buildingHeight))).toEqual(new Set([12, 25]));
    expect(new Set(result.collection.features.map(f => f.id)).size).toBe(result.collection.features.length);
  });
});
