import os from 'os';
import type { ViewBenchmarkResult } from '../metrics/types';
import type { BenchmarkSuiteSummary, CategorySummary } from './types';

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function aggregateBenchmarkResults(results: ViewBenchmarkResult[], totalSuiteDurationMs: number): BenchmarkSuiteSummary {
  const readyTimes = results.map(r => r.totalReadyDurationMs);
  const successCount = results.filter(r => r.status === 'success').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const avgReady = readyTimes.length > 0 ? Math.round(readyTimes.reduce((a, b) => a + b, 0) / readyTimes.length) : 0;

  // Categories
  const categories = Array.from(new Set(results.map(r => r.category)));
  const categorySummaries: CategorySummary[] = categories.map(cat => {
    const catResults = results.filter(r => r.category === cat);
    const catTimes = catResults.map(r => r.totalReadyDurationMs);
    const catBytes = catResults.map(r => r.dataBytes);
    const catSuccess = catResults.filter(r => r.status === 'success').length;
    return {
      category: cat,
      count: catResults.length,
      avgReadyTimeMs: Math.round(catTimes.reduce((a, b) => a + b, 0) / catTimes.length),
      p50ReadyTimeMs: percentile(catTimes, 50),
      p95ReadyTimeMs: percentile(catTimes, 95),
      avgDataBytes: Math.round(catBytes.reduce((a, b) => a + b, 0) / catBytes.length),
      successRate: Math.round((catSuccess / catResults.length) * 100),
    };
  });

  const sortedByTime = [...results].sort((a, b) => b.totalReadyDurationMs - a.totalReadyDurationMs);
  const slowestViews = sortedByTime.slice(0, 5);
  const fastestViews = [...sortedByTime].reverse().slice(0, 5);

  return {
    timestamp: new Date().toISOString(),
    deviceInfo: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      browser: 'Chromium (WebGPU)',
    },
    totalViews: results.length,
    successCount,
    warningCount,
    errorCount,
    totalDurationMs: Math.round(totalSuiteDurationMs),
    avgReadyTimeMs: avgReady,
    p50ReadyTimeMs: percentile(readyTimes, 50),
    p95ReadyTimeMs: percentile(readyTimes, 95),
    slowestViews,
    fastestViews,
    categorySummaries,
    results,
  };
}
