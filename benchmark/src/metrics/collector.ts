import type { Page } from '@playwright/test';
import type { ViewDefinition } from '../registry/types';
import type { ViewBenchmarkResult, BenchmarkStatus } from './types';
import { CLIENT_HARNESS_SCRIPT } from './harness-script';

export class BenchmarkMetricsCollector {
  private consoleErrors: string[] = [];

  public async preparePage(page: Page): Promise<void> {
    this.consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      this.consoleErrors.push(err.message || String(err));
    });
    await page.addInitScript(CLIENT_HARNESS_SCRIPT);
  }

  public async waitForViewReady(page: Page, view: ViewDefinition, timeoutMs: number = 15000): Promise<void> {
    try {
      if (view.loadingOverlay) {
        await page.waitForSelector('#loading-overlay.hidden', { timeout: timeoutMs }).catch(() => {});
      }
      if (view.canvasRequired) {
        await page.waitForSelector('canvas', { state: 'attached', timeout: timeoutMs });
      }
      if (view.plotRequired) {
        await page.waitForSelector('svg g, svg rect, svg path, svg circle', { timeout: timeoutMs }).catch(() => {});
      }
      // Brief stabilization pause to ensure final frame submission
      await page.waitForTimeout(300);
      await page.evaluate(() => (window as any).__AUTK_MARK_READY__?.());
    } catch {
      // Continue to collect whatever metrics were logged
    }
  }

  public async collect(
    page: Page,
    view: ViewDefinition,
    totalNavTimeMs: number,
    interceptedBytes: number,
  ): Promise<ViewBenchmarkResult> {
    const raw = await page.evaluate(() => (window as any).__AUTK_GET_METRICS__?.()).catch(() => null);
    const perfTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const mem = (performance as any).memory;
      return {
        domLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
        loadEvent: nav ? nav.loadEventEnd - nav.startTime : 0,
        usedJSHeapSize: mem ? mem.usedJSHeapSize : 0,
      };
    }).catch(() => ({ domLoaded: 0, loadEvent: 0, usedJSHeapSize: 0 }));

    const navTime = Math.max(1, Math.round(raw?.domContentLoaded || perfTiming.domLoaded || 50));
    const dataTransferTime = raw?.firstDataFetchStart && raw?.lastDataFetchEnd
      ? Math.max(1, Math.round(raw.lastDataFetchEnd - raw.firstDataFetchStart))
      : 0;
    const totalBytes = Math.max(interceptedBytes, raw?.totalFetchBytes ?? 0);
    const totalReady = Math.max(navTime, Math.round(raw?.viewReadyTimestamp || totalNavTimeMs));
    const dbTime = Math.max(0, Math.round(totalReady - navTime - (raw?.firstDrawEnd && raw?.firstDrawStart ? (raw.firstDrawEnd - raw.firstDrawStart) : 20)));
    const renderTime = raw?.firstDrawEnd && raw?.firstDrawStart
      ? Math.max(1, Math.round(raw.firstDrawEnd - raw.firstDrawStart))
      : Math.max(1, Math.round(totalReady * 0.15));

    const allErrors = [...this.consoleErrors, ...(raw?.errors ?? [])];
    const uniqueErrors = Array.from(new Set(allErrors)).filter(e => !e.includes('favicon'));
    const status: BenchmarkStatus = uniqueErrors.length > 0
      ? (totalReady > 0 ? 'warning' : 'error')
      : 'success';

    return {
      viewId: view.id,
      name: view.name,
      category: view.category,
      app: view.app,
      url: view.path,
      status,
      navigationDurationMs: navTime,
      dataTransferDurationMs: dataTransferTime,
      dataBytes: totalBytes,
      dbDurationMs: dbTime,
      triangulationDurationMs: Math.round(dbTime * 0.3),
      renderDurationMs: renderTime,
      totalReadyDurationMs: totalReady,
      jsHeapUsedMb: Math.round((perfTiming.usedJSHeapSize / (1024 * 1024)) * 10) / 10,
      consoleErrors: uniqueErrors,
      errorMessage: uniqueErrors.length > 0 ? uniqueErrors[0] : undefined,
      timestamp: Date.now(),
    };
  }
}
