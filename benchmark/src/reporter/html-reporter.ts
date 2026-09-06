import fs from 'fs';
import path from 'path';
import type { BenchmarkSuiteSummary } from './types';

export function saveHtmlReport(summary: BenchmarkSuiteSummary, outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonSummary = JSON.stringify(summary);
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Autark Benchmark Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --success: #4ade80;
      --warning: #facc15;
      --error: #f87171;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header { margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
    h1 { margin: 0 0 8px 0; color: var(--accent); }
    .meta { color: var(--muted); font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card-title { font-size: 13px; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
    .card-value { font-size: 28px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; margin-top: 16px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; }
    th { background: #182234; color: var(--muted); font-weight: 600; }
    tr:hover { background: #253349; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; display: inline-block; }
    .badge-success { background: rgba(74, 222, 128, 0.15); color: var(--success); }
    .badge-warning { background: rgba(250, 204, 21, 0.15); color: var(--warning); }
    .badge-error { background: rgba(248, 113, 113, 0.15); color: var(--error); }
    .filter-bar { display: flex; gap: 8px; margin: 16px 0; }
    input { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; flex: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Autark Performance Benchmark</h1>
      <div class="meta">Ran on: ${summary.timestamp} | Platform: ${summary.deviceInfo.platform} (${summary.deviceInfo.arch})</div>
    </header>

    <div class="grid">
      <div class="card"><div class="card-title">Total Views</div><div class="card-value">${summary.totalViews}</div></div>
      <div class="card"><div class="card-title">Avg Ready Time</div><div class="card-value" style="color: var(--accent);">${summary.avgReadyTimeMs} ms</div></div>
      <div class="card"><div class="card-title">Median (p50)</div><div class="card-value">${summary.p50ReadyTimeMs} ms</div></div>
      <div class="card"><div class="card-title">95th Percentile</div><div class="card-value">${summary.p95ReadyTimeMs} ms</div></div>
      <div class="card"><div class="card-title">Pass Rate</div><div class="card-value" style="color: var(--success);">${Math.round((summary.successCount / summary.totalViews) * 100)}%</div></div>
    </div>

    <div class="filter-bar">
      <input type="text" id="filterInput" placeholder="Filter views by name, category, or app...">
    </div>

    <table id="viewsTable">
      <thead>
        <tr>
          <th>Status</th>
          <th>View ID</th>
          <th>App</th>
          <th>Category</th>
          <th>Nav (ms)</th>
          <th>DB/Proc (ms)</th>
          <th>Render (ms)</th>
          <th>Total Ready (ms)</th>
          <th>Memory (MB)</th>
        </tr>
      </thead>
      <tbody>
        ${summary.results.map(r => `
          <tr>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td><strong>${r.viewId}</strong></td>
            <td>${r.app}</td>
            <td>${r.category}</td>
            <td>${r.navigationDurationMs}</td>
            <td>${r.dbDurationMs}</td>
            <td>${r.renderDurationMs}</td>
            <td><strong>${r.totalReadyDurationMs}</strong></td>
            <td>${r.jsHeapUsedMb}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  <script>
    const data = ${jsonSummary};
    const input = document.getElementById('filterInput');
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const rows = document.querySelectorAll('#viewsTable tbody tr');
      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;

  const filePath = path.join(outputDir, 'benchmark-report.html');
  fs.writeFileSync(filePath, htmlContent, 'utf-8');
  return filePath;
}
