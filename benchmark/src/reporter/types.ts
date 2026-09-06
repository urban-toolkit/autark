import type { ViewBenchmarkResult } from '../metrics/types';

export interface CategorySummary {
  category: string;
  count: number;
  avgReadyTimeMs: number;
  p50ReadyTimeMs: number;
  p95ReadyTimeMs: number;
  avgDataBytes: number;
  successRate: number;
}

export interface BenchmarkSuiteSummary {
  timestamp: string;
  deviceInfo: {
    platform: string;
    arch: string;
    nodeVersion: string;
    browser: string;
  };
  totalViews: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
  totalDurationMs: number;
  avgReadyTimeMs: number;
  p50ReadyTimeMs: number;
  p95ReadyTimeMs: number;
  slowestViews: ViewBenchmarkResult[];
  fastestViews: ViewBenchmarkResult[];
  categorySummaries: CategorySummary[];
  results: ViewBenchmarkResult[];
}
