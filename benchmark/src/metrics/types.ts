export type BenchmarkStatus = 'success' | 'warning' | 'error';

export interface ViewBenchmarkResult {
  viewId: string;
  name: string;
  category: string;
  app: string;
  url: string;
  status: BenchmarkStatus;
  navigationDurationMs: number;
  dataTransferDurationMs: number;
  dataBytes: number;
  dbDurationMs: number;
  triangulationDurationMs: number;
  renderDurationMs: number;
  totalReadyDurationMs: number;
  jsHeapUsedMb: number;
  consoleErrors: string[];
  errorMessage?: string;
  timestamp: number;
}

export interface ClientPerformanceMetrics {
  navStart: number;
  domContentLoaded: number;
  firstDataFetchStart?: number;
  lastDataFetchEnd?: number;
  dbInitStart?: number;
  dbInitEnd?: number;
  dbQueryStart?: number;
  dbQueryEnd?: number;
  triangulationStart?: number;
  triangulationEnd?: number;
  firstDrawStart?: number;
  firstDrawEnd?: number;
  viewReadyTimestamp?: number;
  totalDrawCalls?: number;
  errors?: string[];
}
