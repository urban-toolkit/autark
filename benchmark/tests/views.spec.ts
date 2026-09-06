import path from 'path';
import { test, expect } from '@playwright/test';
import { ALL_VIEWS } from '../src/registry';
import { BenchmarkRouteInterceptor } from '../src/mock';
import { BenchmarkMetricsCollector, type ViewBenchmarkResult } from '../src/metrics';
import {
  aggregateBenchmarkResults,
  printCliSummary,
  saveJsonReport,
  saveMarkdownReport,
  saveHtmlReport,
} from '../src/reporter';

const RESULTS_DIR = path.resolve(process.cwd(), 'results');
const results: ViewBenchmarkResult[] = [];
const suiteStartTime = performance.now();

test.describe('Autark All Views Performance Benchmark', () => {
  test.afterAll(() => {
    const totalSuiteDuration = performance.now() - suiteStartTime;
    const summary = aggregateBenchmarkResults(results, totalSuiteDuration);

    printCliSummary(summary);
    saveJsonReport(summary, RESULTS_DIR);
    saveMarkdownReport(summary, RESULTS_DIR);
    saveHtmlReport(summary, RESULTS_DIR);
  });

  for (const view of ALL_VIEWS) {
    test(`[${view.app}] ${view.name} (${view.id})`, async ({ page }) => {
      const interceptor = new BenchmarkRouteInterceptor({
        syntheticScale: 'standard',
        interceptOverpass: true,
        interceptStaticData: true,
      });
      await interceptor.setup(page);

      const collector = new BenchmarkMetricsCollector();
      await collector.preparePage(page);

      const port = view.app === 'gallery' ? 6173 : 6174;
      const targetUrl = `http://localhost:${port}${view.path}`;

      const navStart = performance.now();
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await collector.waitForViewReady(page, view, 15000);
      const totalNavTimeMs = performance.now() - navStart;

      const result = await collector.collect(
        page,
        view,
        totalNavTimeMs,
        interceptor.getTotalDataBytes(),
      );

      results.push(result);
      expect(result.status).not.toBe('error');
    });
  }
});
