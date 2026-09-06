import { test, expect } from '@playwright/test';
import {
  benchmarkPolygonTriangulation,
  benchmarkBuildingTriangulation,
  benchmarkPolylineTriangulation,
} from '../src/direct/map-benchmark';

test.describe('Synthetic Data Scaling & Ingestion Benchmark', () => {
  const SIZES = [100, 500, 2000, 10000];

  for (const count of SIZES) {
    test(`Polygon Triangulation scaling: ${count} features`, () => {
      const res = benchmarkPolygonTriangulation(count);
      console.log(
        `[Polygon Triangulation] ${count} features: ${res.durationMs}ms (${res.throughputFeaturesPerSec} feat/s, ${res.geometryChunks} chunks)`,
      );
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.featureCount).toBe(count);
    });

    test(`Building Triangulation scaling: ${count} features`, () => {
      const res = benchmarkBuildingTriangulation(count);
      console.log(
        `[Building Triangulation] ${count} features: ${res.durationMs}ms (${res.throughputFeaturesPerSec} feat/s, ${res.geometryChunks} chunks)`,
      );
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.featureCount).toBe(count);
    });

    test(`Polyline Triangulation scaling: ${count} features`, () => {
      const res = benchmarkPolylineTriangulation(count);
      console.log(
        `[Polyline Triangulation] ${count} features: ${res.durationMs}ms (${res.throughputFeaturesPerSec} feat/s, ${res.geometryChunks} chunks)`,
      );
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.featureCount).toBe(count);
    });
  }
});
