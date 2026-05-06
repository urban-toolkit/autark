import type { ProvenanceGraph } from '../types';
import { computeSelectionFrequency } from './selection-frequency';
import type { GraphMetrics, InsightAnnotation, InsightSelectionState, StrategyLabel } from './types';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function generateSessionNarrative<T extends InsightSelectionState>(
  graph: ProvenanceGraph<T>,
  metrics: GraphMetrics,
  annotations: InsightAnnotation[]
): string {
  const timestamps = Array.from(graph.nodes.values()).map((node) => node.timestamp).sort((a, b) => a - b);
  const sessionStart = timestamps[0];
  const selectionFrequency = computeSelectionFrequency(graph);
  const topMap = [...selectionFrequency.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topPlots = [...selectionFrequency.plots.entries()]
    .map(([plotId, plotFreq]) => ({
      plotId,
      entries: [...plotFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }))
    .filter((plot) => plot.entries.length > 0);
  const lines = [
    `Session started at ${typeof sessionStart === 'number' ? new Date(sessionStart).toLocaleTimeString() : '—'}.`,
    `Duration: ${formatDuration(metrics.sessionDurationMs)} across ${metrics.totalNodes} states (avg ${formatDuration(metrics.avgTimePerStateMs)} per state).`,
    '',
    `Analysis strategy: ${metrics.strategyLabel}`,
    strategyDescription[metrics.strategyLabel],
    `Branch/backtrack summary: ${metrics.branchPoints} branch point${metrics.branchPoints !== 1 ? 's' : ''} and ${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''}.`,
  ];

  if (topMap.length > 0) {
    lines.push('', `Most revisited map features across all branches: ${topMap.map(([id, count]) => `feature #${id} (${count} state${count !== 1 ? 's' : ''})`).join(', ')}.`);
  } else {
    lines.push('', 'Most revisited map features across all branches: none recorded.');
  }

  if (topPlots.length > 0) {
    topPlots.forEach(({ plotId, entries }) => {
      lines.push(`Most revisited features in plot "${plotId}": ${entries.map(([id, count]) => `#${id} (${count}×)`).join(', ')}.`);
    });
  } else {
    lines.push('Most revisited plot features: none recorded.');
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
