import type { AutarkProvenanceState, ProvenanceGraph } from '../types';
import { computeSelectionFrequency } from './selection-frequency';
import type { GraphMetrics, InsightAnnotation, StrategyLabel } from './types';
import { formatDuration } from './utils';

export function generateSessionNarrative(
  graph: ProvenanceGraph<AutarkProvenanceState>,
  metrics: GraphMetrics,
  annotations: InsightAnnotation[]
): string {
  const lines: string[] = [];
  const root = graph.nodes.get(graph.rootId);
  const startTime = root ? new Date(root.timestamp).toLocaleTimeString() : '—';
  const strategyDesc: Record<StrategyLabel, string> = {
    Confirmatory: 'A focused, linear exploration — the analyst appeared to know what they were looking for.',
    Exploratory: 'A broad, open-ended investigation with multiple diverging paths.',
    'Iterative Refinement': 'A hypothesis-driven approach with repeated backtracking and revision.',
  };

  lines.push(`Session started at ${startTime}.`);
  lines.push(
    `Duration: ${formatDuration(metrics.sessionDurationMs)} across ${metrics.totalNodes} states ` +
      `(avg ${formatDuration(metrics.avgTimePerStateMs)} per state).`
  );
  lines.push(`\nAnalysis strategy: ${metrics.strategyLabel}`);
  lines.push(strategyDesc[metrics.strategyLabel]);

  if (metrics.branchPoints > 0) {
    lines.push(
      `The analysis diverged at ${metrics.branchPoints} branch point${metrics.branchPoints > 1 ? 's' : ''}, ` +
        `with ${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''} before settling on the current path.`
    );
  }

  const freq = computeSelectionFrequency(graph);
  const topMap = [...freq.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topMap.length > 0) {
    lines.push(
      `\nMost revisited map features across all branches: ` +
        topMap.map(([id, c]) => `feature #${id} (${c} state${c !== 1 ? 's' : ''})`).join(', ') +
        '.'
    );
  }
  for (const [plotId, plotFreq] of freq.plots.entries()) {
    const top = [...plotFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length > 0 && top[0][1] > 1) {
      lines.push(`Most revisited features in plot "${plotId}": ${top.map(([id, c]) => `#${id} (${c}×)`).join(', ')}.`);
    }
  }

  if (annotations.length > 0) {
    lines.push(`\nRecorded insights (${annotations.length}):`);
    for (const a of annotations) lines.push(`  • [${a.actionLabel}] ${a.text}`);
  } else {
    lines.push('\nNo insight annotations were recorded during this session.');
  }

  return lines.join('\n');
}
