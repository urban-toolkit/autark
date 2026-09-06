import { TriangulatorPolygons, TriangulatorBuildings, TriangulatorPolylines } from '@urban-toolkit/autk-core';
import { generateSyntheticPolygons, generateSyntheticBuildings, generateSyntheticLines } from '../generators/geojson-generator';

const DEFAULT_ORIGIN = [-74.0060, 40.7128];

export interface TriangulationBenchmarkResult {
  triangulator: string;
  featureCount: number;
  geometryChunks: number;
  durationMs: number;
  throughputFeaturesPerSec: number;
}

export function benchmarkPolygonTriangulation(count: number): TriangulationBenchmarkResult {
  const geojson = generateSyntheticPolygons({ count });
  const start = performance.now();
  const [meshes, comps] = TriangulatorPolygons.buildMesh(geojson, DEFAULT_ORIGIN);
  const durationMs = performance.now() - start;

  return {
    triangulator: 'TriangulatorPolygons',
    featureCount: comps.length,
    geometryChunks: meshes.length,
    durationMs: Math.max(1, Math.round(durationMs)),
    throughputFeaturesPerSec: Math.round(count / (durationMs / 1000)),
  };
}

export function benchmarkBuildingTriangulation(count: number): TriangulationBenchmarkResult {
  const geojson = generateSyntheticBuildings({ count });
  const start = performance.now();
  const [meshes, comps] = TriangulatorBuildings.buildMesh(geojson, DEFAULT_ORIGIN, true);
  const durationMs = performance.now() - start;

  return {
    triangulator: 'TriangulatorBuildings',
    featureCount: comps.length,
    geometryChunks: meshes.length,
    durationMs: Math.max(1, Math.round(durationMs)),
    throughputFeaturesPerSec: Math.round(count / (durationMs / 1000)),
  };
}

export function benchmarkPolylineTriangulation(count: number): TriangulationBenchmarkResult {
  const geojson = generateSyntheticLines({ count });
  const start = performance.now();
  const [meshes, comps] = TriangulatorPolylines.buildMesh(geojson, DEFAULT_ORIGIN);
  const durationMs = performance.now() - start;

  return {
    triangulator: 'TriangulatorPolylines',
    featureCount: comps.length,
    geometryChunks: meshes.length,
    durationMs: Math.max(1, Math.round(durationMs)),
    throughputFeaturesPerSec: Math.round(count / (durationMs / 1000)),
  };
}
