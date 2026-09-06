import type { BenchmarkSuiteSummary } from './types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(str: string, length: number): string {
  return str.length > length ? str.substring(0, length - 3) + '...' : str.padEnd(length, ' ');
}

export function printCliSummary(summary: BenchmarkSuiteSummary): void {
  const line = '═'.repeat(105);
  const thinLine = '─'.repeat(105);

  console.log('\n' + line);
  console.log(`  AUTARK PERFORMANCE BENCHMARK REPORT (${summary.deviceInfo.platform} ${summary.deviceInfo.arch})`);
  console.log(`  Total Views: ${summary.totalViews} | Success: ${summary.successCount} | Warnings: ${summary.warningCount} | Errors: ${summary.errorCount}`);
  console.log(`  Avg Ready Time: ${summary.avgReadyTimeMs}ms | p50: ${summary.p50ReadyTimeMs}ms | p95: ${summary.p95ReadyTimeMs}ms`);
  console.log(line);

  console.log(
    `  ${pad('View ID', 35)} ${pad('App', 10)} ${pad('Category', 16)} ${pad('Data', 10)} ${pad('Nav', 8)} ${pad('DB/Proc', 9)} ${pad('Render', 8)} ${pad('Ready', 8)}`,
  );
  console.log(thinLine);

  for (const r of summary.results) {
    const statusIcon = r.status === 'success' ? '✓' : r.status === 'warning' ? '⚠' : '✗';
    console.log(
      ` ${statusIcon} ${pad(r.viewId, 34)} ${pad(r.app, 10)} ${pad(r.category, 16)} ${pad(formatBytes(r.dataBytes), 10)} ${pad(`${r.navigationDurationMs}ms`, 8)} ${pad(`${r.dbDurationMs}ms`, 9)} ${pad(`${r.renderDurationMs}ms`, 8)} ${pad(`${r.totalReadyDurationMs}ms`, 8)}`,
    );
  }

  console.log(thinLine);
  console.log('  CATEGORY BREAKDOWN:');
  for (const cat of summary.categorySummaries) {
    console.log(
      `   • ${pad(cat.category, 20)}: ${cat.count} views, avg ${cat.avgReadyTimeMs}ms (p50: ${cat.p50ReadyTimeMs}ms, p95: ${cat.p95ReadyTimeMs}ms, avg data: ${formatBytes(cat.avgDataBytes)})`,
    );
  }

  console.log('\n  TOP 5 SLOWEST VIEWS:');
  for (let i = 0; i < summary.slowestViews.length; i++) {
    const v = summary.slowestViews[i];
    console.log(`   ${i + 1}. ${v.viewId} (${v.app}) - ${v.totalReadyDurationMs}ms [DB: ${v.dbDurationMs}ms, Render: ${v.renderDurationMs}ms, Data: ${formatBytes(v.dataBytes)}]`);
  }

  console.log(line + '\n');
}
