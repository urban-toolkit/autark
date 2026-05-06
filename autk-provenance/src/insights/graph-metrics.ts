import type { ProvenanceGraph } from '../types';
import type { GraphMetrics } from './types';

function computeMaxDepth<T>(graph: ProvenanceGraph<T>): number {
  let maxDepth = 0;
  const visited = new Set<string>();

  function visit(nodeId: string, depth: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    maxDepth = Math.max(maxDepth, depth);
    graph.nodes.get(nodeId)?.childrenIds.forEach((childId) => visit(childId, depth + 1));
  }

  visit(graph.rootId, 0);
  return maxDepth;
}

export function computeGraphMetrics<T>(graph: ProvenanceGraph<T>): GraphMetrics {
  const nodes = Array.from(graph.nodes.values());
  const insightCount = nodes.filter((node) => typeof node.metadata?.insight === 'string' && `${node.metadata.insight}`.trim().length > 0).length;

  if (nodes.length <= 1) {
    return {
      totalNodes: nodes.length,
      branchPoints: 0,
      backtracks: 0,
      maxDepth: 0,
      sessionDurationMs: 0,
      avgTimePerStateMs: 0,
      branchRatio: 0,
      strategyLabel: 'Confirmatory',
      insightCount,
    };
  }

  const branchPoints = nodes.filter((node) => node.childrenIds.length > 1).length;
  const backtracks = nodes.reduce((count, node) => count + Math.max(0, node.childrenIds.length - 1), 0);
  const timestamps = nodes.map((node) => node.timestamp).sort((a, b) => a - b);
  const sessionDurationMs = timestamps[timestamps.length - 1] - timestamps[0];
  const branchRatio = branchPoints / nodes.length;

  return {
    totalNodes: nodes.length,
    branchPoints,
    backtracks,
    maxDepth: computeMaxDepth(graph),
    sessionDurationMs,
    avgTimePerStateMs: Math.round(sessionDurationMs / (nodes.length - 1)),
    branchRatio,
    strategyLabel:
      backtracks >= 3 && branchRatio >= 0.15
        ? 'Iterative Refinement'
        : branchRatio >= 0.15 || backtracks >= 2
          ? 'Exploratory'
          : 'Confirmatory',
    insightCount,
  };
}
