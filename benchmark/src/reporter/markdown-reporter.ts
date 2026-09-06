import fs from 'fs';
import path from 'path';
import type { BenchmarkSuiteSummary } from './types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function saveMarkdownReport(summary: BenchmarkSuiteSummary, outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lines: string[] = [
    '# Autark Performance Benchmark Report',
    '',
    `Generated on: \`${summary.timestamp}\` on \`${summary.deviceInfo.platform} ${summary.deviceInfo.arch}\``,
    '',
    '## Executive Summary',
    '',
    `- **Total Views Benchmarked:** ${summary.totalViews}`,
    `- **Success:** ${summary.successCount} | **Warnings:** ${summary.warningCount} | **Errors:** ${summary.errorCount}`,
    `- **Average Ready Time:** ${summary.avgReadyTimeMs} ms`,
    `- **Median (p50) Ready Time:** ${summary.p50ReadyTimeMs} ms`,
    `- **95th Percentile (p95):** ${summary.p95ReadyTimeMs} ms`,
    `- **Total Suite Execution Time:** ${(summary.totalDurationMs / 1000).toFixed(1)} s`,
    '',
    '## Category Breakdown',
    '',
    '| Category | Views | Avg Ready (ms) | p50 (ms) | p95 (ms) | Avg Data Size | Success Rate |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const cat of summary.categorySummaries) {
    lines.push(
      `| **${cat.category}** | ${cat.count} | ${cat.avgReadyTimeMs} | ${cat.p50ReadyTimeMs} | ${cat.p95ReadyTimeMs} | ${formatBytes(cat.avgDataBytes)} | ${cat.successRate}% |`,
    );
  }

  lines.push('', '## Top 5 Slowest Views', '');
  lines.push('| View | App | Category | Ready (ms) | DB/Data (ms) | Render (ms) | Data Transferred |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const v of summary.slowestViews) {
    lines.push(
      `| \`${v.viewId}\` | ${v.app} | ${v.category} | ${v.totalReadyDurationMs} | ${v.dbDurationMs} | ${v.renderDurationMs} | ${formatBytes(v.dataBytes)} |`,
    );
  }

  lines.push('', '## All Benchmark Results', '');
  lines.push('| Status | View ID | App | Category | Nav (ms) | Data (ms) | DB (ms) | Render (ms) | Total Ready (ms) | Memory (MB) |');
  lines.push('| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const r of summary.results) {
    const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
    lines.push(
      `| ${icon} | \`${r.viewId}\` | ${r.app} | ${r.category} | ${r.navigationDurationMs} | ${r.dataTransferDurationMs} | ${r.dbDurationMs} | ${r.renderDurationMs} | **${r.totalReadyDurationMs}** | ${r.jsHeapUsedMb} |`,
    );
  }

  lines.push('');
  const filePath = path.join(outputDir, 'benchmark-report.md');
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}
