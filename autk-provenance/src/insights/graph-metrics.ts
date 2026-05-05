import type { AutarkProvenanceState, ProvenanceGraph } from '../types';
import type { GraphMetrics, StrategyLabel } from './types';

function computeMaxDepth(graph: ProvenanceGraph<AutarkProvenanceState>): number {
  let max = 0;
  const visited = new Set<string>();
  const dfs = (id: string, depth: number): void => {
    if (visited.has(id)) return;
    visited.add(id);
    max = Math.max(max, depth);
    const node = graph.nodes.get(id);
    if (!node) return;
    for (const child of node.childrenIds) dfs(child, depth + 1);
  };
  dfs(graph.rootId, 0);
  return max;
}

export function computeGraphMetrics(
  graph: ProvenanceGraph<AutarkProvenanceState>
): GraphMetrics {
  const nodes = Array.from(graph.nodes.values());
  const total = nodes.length;
  if (total <= 1) {
    return {
      totalNodes: total,
      branchPoints: 0,
      backtracks: 0,
      maxDepth: 0,
      sessionDurationMs: 0,
      avgTimePerStateMs: 0,
      branchRatio: 0,
      strategyLabel: 'Confirmatory',
      insightCount: 0,
    };
  }

  const branchPoints = nodes.filter((n) => n.childrenIds.length > 1).length;
  const backtracks = nodes.reduce((acc, n) => acc + Math.max(0, n.childrenIds.length - 1), 0);
  const branchRatio = branchPoints / total;
  const timestamps = nodes.map((n) => n.timestamp).sort((a, b) => a - b);
  const sessionDurationMs = timestamps[timestamps.length - 1] - timestamps[0];
  const strategyLabel: StrategyLabel =
    backtracks >= 3 && branchRatio >= 0.15
      ? 'Iterative Refinement'
      : branchRatio >= 0.15 || backtracks >= 2
        ? 'Exploratory'
        : 'Confirmatory';

  return {
    totalNodes: total,
    branchPoints,
    backtracks,
    maxDepth: computeMaxDepth(graph),
    sessionDurationMs,
    avgTimePerStateMs: total > 1 ? Math.round(sessionDurationMs / (total - 1)) : 0,
    branchRatio,
    strategyLabel,
    insightCount: nodes.filter(
      (n) => typeof n.metadata?.insight === 'string' && (n.metadata.insight as string).trim().length > 0
    ).length,
  };
}
