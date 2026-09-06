import type { BoundingBox2D } from './types';
import { DeterministicRandom } from './prng';

export interface ThomasClusterConfig {
  parentCount?: number;
  clusterRadiusStd?: number;
  backgroundUniformRatio?: number;
  seed?: number;
}

/**
 * Generates clustered 2D coordinates using the Hierarchical Thomas Cluster Process.
 * Matches Apache Sedona SpatialBench spatial point distribution standards.
 */
export function generateThomasClusterPoints(
  count: number,
  bbox: BoundingBox2D,
  config: ThomasClusterConfig = {},
): Array<[number, number]> {
  const rng = new DeterministicRandom(config.seed ?? 1337);
  const parentCount = config.parentCount ?? Math.max(3, Math.round(Math.sqrt(count) * 0.5));
  const radiusStd = config.clusterRadiusStd ?? 0.006;
  const uniformRatio = config.backgroundUniformRatio ?? 0.15;

  const parents: Array<[number, number]> = [];
  for (let p = 0; p < parentCount; p++) {
    parents.push([
      rng.nextRange(bbox.minLon, bbox.maxLon),
      rng.nextRange(bbox.minLat, bbox.maxLat),
    ]);
  }

  const points: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (rng.nextFloat() < uniformRatio) {
      points.push([
        rng.nextRange(bbox.minLon, bbox.maxLon),
        rng.nextRange(bbox.minLat, bbox.maxLat),
      ]);
    } else {
      const parent = parents[i % parentCount];
      const lon = rng.nextGaussian(parent[0], radiusStd);
      const lat = rng.nextGaussian(parent[1], radiusStd);
      const clampedLon = Math.min(bbox.maxLon, Math.max(bbox.minLon, lon));
      const clampedLat = Math.min(bbox.maxLat, Math.max(bbox.minLat, lat));
      points.push([clampedLon, clampedLat]);
    }
  }

  return points;
}

/**
 * Generates points snapped along road polyline segments with normal distance jitter.
 * Replicates BerlinMOD / urban network-constrained movement.
 */
export function generateRoadAlignedPoints(
  count: number,
  roadSegments: Array<[[number, number], [number, number]]>,
  jitterMetersStd: number = 8,
  seed: number = 2026,
): Array<[number, number]> {
  if (roadSegments.length === 0) return [];
  const rng = new DeterministicRandom(seed);
  const points: Array<[number, number]> = [];
  const degPerMeter = 1.0 / 111320.0;

  for (let i = 0; i < count; i++) {
    const seg = roadSegments[i % roadSegments.length];
    const t = rng.nextFloat();
    const baseLon = seg[0][0] + (seg[1][0] - seg[0][0]) * t;
    const baseLat = seg[0][1] + (seg[1][1] - seg[0][1]) * t;

    const lonOffset = rng.nextGaussian(0, jitterMetersStd * degPerMeter);
    const latOffset = rng.nextGaussian(0, jitterMetersStd * degPerMeter);

    points.push([baseLon + lonOffset, baseLat + latOffset]);
  }

  return points;
}
