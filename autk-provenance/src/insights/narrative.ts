import type { AutarkProvenanceState, ProvenanceGraph } from '../types';
import type { InsightAnnotation } from './annotations';
import { computeSelectionFrequency } from './selection-frequency';
import type { GraphMetrics, StrategyLabel } from './graph-metrics';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function generateSessionNarrative(
  graph: ProvenanceGraph<AutarkProvenanceState>,
  metrics: GraphMetrics,
  annotations: InsightAnnotation[]
): string {
  const lines = [
    `Session started at ${graph.nodes.get(graph.rootId) ? new Date(graph.nodes.get(graph.rootId)!.timestamp).toLocaleTimeString() : '—'}.`,
    `Duration: ${formatDuration(metrics.sessionDurationMs)} across ${metrics.totalNodes} states (avg ${formatDuration(metrics.avgTimePerStateMs)} per state).`,
    '',
    `Analysis strategy: ${metrics.strategyLabel}`,
    strategyDescription[metrics.strategyLabel],
  ];

  if (metrics.branchPoints > 0) {
    lines.push(
      `The analysis diverged at ${metrics.branchPoints} branch point${metrics.branchPoints > 1 ? 's' : ''}, with ${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''} before settling on the current path.`
    );
  }

  const selectionFrequency = computeSelectionFrequency(graph);
  const topMap = [...selectionFrequency.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topMap.length > 0) {
    lines.push('', `Most revisited map features across all branches: ${topMap.map(([id, count]) => `feature #${id} (${count} state${count !== 1 ? 's' : ''})`).join(', ')}.`);
  }

  for (const [plotId, plotFreq] of selectionFrequency.plots.entries()) {
    const topPlot = [...plotFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topPlot.length > 0 && topPlot[0][1] > 1) {
      lines.push(`Most revisited features in plot "${plotId}": ${topPlot.map(([id, count]) => `#${id} (${count}×)`).join(', ')}.`);
    }
  }

  if (annotations.length > 0) {
    lines.push('', `Recorded insights (${annotations.length}):`);
    annotations.forEach((annotation) => lines.push(`  • [${annotation.actionLabel}] ${annotation.text}`));
  } else {
    lines.push('', 'No insight annotations were recorded during this session.');
  }

  return lines.join('\n');
}

const strategyDescription: Record<StrategyLabel, string> = {
  Confirmatory: 'A focused, linear exploration — the analyst appeared to know what they were looking for.',
  Exploratory: 'A broad, open-ended investigation with multiple diverging paths.',
  'Iterative Refinement': 'A hypothesis-driven approach with repeated backtracking and revision.',
};
