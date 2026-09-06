import { test, expect } from '@playwright/test';
import { SpatialBenchSuiteRunner } from '../src/direct/spatialbench-runner';

test.describe('Apache Sedona SpatialBench Standardized Suite (DuckDB-WASM)', () => {
  const SCALE_FACTORS = [0.05, 0.2, 1.0];
  const runner = new SpatialBenchSuiteRunner();

  test.beforeAll(async () => {
    await runner.init();
  });

  for (const sf of SCALE_FACTORS) {
    test(`SpatialBench Data Ingestion (SF ${sf})`, async () => {
      const stats = await runner.loadScaleFactorData(sf);
      console.log(
        `[SpatialBench SF ${sf}] Ingestion: ${stats.loadDurationMs}ms (Trips: ${stats.tripCount}, Buildings: ${stats.buildingCount}, Zones: ${stats.zoneCount})`,
      );
      expect(stats.loadDurationMs).toBeGreaterThan(0);
      expect(stats.tripCount).toBeGreaterThan(0);
    });

    test(`SpatialBench Q1: Distance Join (SF ${sf})`, async () => {
      const res = await runner.runQ1DistanceJoin(sf);
      console.log(`[SpatialBench SF ${sf}] Q1 (Distance Join): ${res.durationMs}ms (${res.resultCount} rows)`);
      expect(res.durationMs).toBeGreaterThan(0);
    });

    test(`SpatialBench Q2: Point-in-Polygon (SF ${sf})`, async () => {
      const res = await runner.runQ2PointInPolygonJoin(sf);
      console.log(`[SpatialBench SF ${sf}] Q2 (Point-in-Polygon): ${res.durationMs}ms (${res.resultCount} zones)`);
      expect(res.durationMs).toBeGreaterThan(0);
    });

    test(`SpatialBench Q3: Convex Hull Aggregation (SF ${sf})`, async () => {
      const res = await runner.runQ3ConvexHullAggregation(sf);
      console.log(`[SpatialBench SF ${sf}] Q3 (Convex Hull Aggregation): ${res.durationMs}ms (${res.resultCount} rows)`);
      expect(res.durationMs).toBeGreaterThan(0);
    });
  }
});
