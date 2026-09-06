import fs from 'fs';
import path from 'path';
import type { BenchmarkSuiteSummary } from './types';

export function saveJsonReport(summary: BenchmarkSuiteSummary, outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filePath = path.join(outputDir, 'benchmark-report.json');
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
  return filePath;
}
