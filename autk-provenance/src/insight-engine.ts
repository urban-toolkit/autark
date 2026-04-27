/**
 * Insight Engine — "not just logging"
 *
 * Derives new information from the provenance graph that does not exist in any
 * single node. Implements three capabilities grounded in the Week 12 readings:
 *
 * 1. Selection frequency (ProWis: aggregate statistics across ensemble members)
 * 2. Graph metrics + strategy classification (Ragan: rationale & meta-analysis)
 * 3. Session narrative generator (Ragan: presentation purpose; Elicitation paper:
 *    users form "stories beyond the data" — the system should surface that story)
 */

import type { AutarkProvenanceState, ProvenanceGraph } from './types';

// ---------------------------------------------------------------------------
// Feature 2: Aggregate Selection Frequency
// ---------------------------------------------------------------------------

export interface SelectionFrequency {
  /** Map feature IDs → count of provenance states where that feature was selected */
  map: Map<number, number>;
  /** Per-plot feature frequency: plotId → (featureId → count) */
  plots: Map<string, Map<number, number>>;
}

/**
 * Iterates every node in the graph (not just the current path) and tallies
 * how many states each feature appears in. Analogous to ProWis computing
 * aggregate statistics across all ensemble members.
 */
export function computeSelectionFrequency(
  graph: ProvenanceGraph<AutarkProvenanceState>
): SelectionFrequency {
  const mapFreq = new Map<number, number>();
  const plotsFreq = new Map<string, Map<number, number>>();

  for (const node of graph.nodes.values()) {
    const sel = node.state.selection;
    if (sel?.map?.ids) {
      for (const id of sel.map.ids) {
        mapFreq.set(id, (mapFreq.get(id) ?? 0) + 1);
      }
    }
    for (const [plotId, plotSel] of Object.entries(sel?.plots ?? {})) {
      if (!plotSel?.ids?.length) continue;
      if (!plotsFreq.has(plotId)) plotsFreq.set(plotId, new Map());
      const freq = plotsFreq.get(plotId)!;
      for (const id of plotSel.ids) {
        freq.set(id, (freq.get(id) ?? 0) + 1);
      }
    }
  }

  return { map: mapFreq, plots: plotsFreq };
}

// ---------------------------------------------------------------------------
// Feature 3: Graph Metrics + Rationale Inference
// ---------------------------------------------------------------------------

export type StrategyLabel = 'Confirmatory' | 'Exploratory' | 'Iterative Refinement';

export interface GraphMetrics {
  totalNodes: number;
  /** Nodes with more than one child — each is a decision/revision point */
  branchPoints: number;
  /** Total extra children beyond first across all branch points */
  backtracks: number;
  maxDepth: number;
  sessionDurationMs: number;
  avgTimePerStateMs: number;
  branchRatio: number;
  /** Inferred from graph topology (Ragan §4.1.5: rationale can be inferred from logs) */
  strategyLabel: StrategyLabel;
  /** Nodes that carry an insight annotation */
  insightCount: number;
}

function computeMaxDepth(graph: ProvenanceGraph<AutarkProvenanceState>): number {
  let max = 0;
  const visited = new Set<string>();
  function dfs(id: string, depth: number): void {
    if (visited.has(id)) return;
    visited.add(id);
    max = Math.max(max, depth);
    const node = graph.nodes.get(id);
    if (!node) return;
    for (const child of node.childrenIds) dfs(child, depth + 1);
  }
  dfs(graph.rootId, 0);
  return max;
}

/**
 * Derives structural metrics from the provenance DAG.
 * Ragan §4.1.5: "a significant amount of reasoning information can be inferred
 * by analyzing system logs of events and interactions."
 */
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
  const backtracks = nodes.reduce(
    (acc, n) => acc + Math.max(0, n.childrenIds.length - 1),
    0
  );
  const branchRatio = branchPoints / total;
  const maxDepth = computeMaxDepth(graph);

  const timestamps = nodes.map((n) => n.timestamp).sort((a, b) => a - b);
  const sessionDurationMs = timestamps[timestamps.length - 1] - timestamps[0];
  const avgTimePerStateMs = total > 1 ? Math.round(sessionDurationMs / (total - 1)) : 0;

  const insightCount = nodes.filter(
    (n) => typeof n.metadata?.insight === 'string' && (n.metadata.insight as string).trim().length > 0
  ).length;

  // Strategy classification based on topology (Ragan §4.1.5)
  let strategyLabel: StrategyLabel;
  if (backtracks >= 3 && branchRatio >= 0.15) {
    strategyLabel = 'Iterative Refinement';
  } else if (branchRatio >= 0.15 || backtracks >= 2) {
    strategyLabel = 'Exploratory';
  } else {
    strategyLabel = 'Confirmatory';
  }

  return {
    totalNodes: total,
    branchPoints,
    backtracks,
    maxDepth,
    sessionDurationMs,
    avgTimePerStateMs,
    branchRatio,
    strategyLabel,
    insightCount,
  };
}

// ---------------------------------------------------------------------------
// Feature 1: Insight Annotations
// ---------------------------------------------------------------------------

export interface InsightAnnotation {
  nodeId: string;
  actionLabel: string;
  text: string;
  timestamp: number;
}

/**
 * Collects all insight annotations stored in node metadata, ordered by time.
 * Annotations are written by the user via the UI (Ragan §4.1.4 — insight
 * provenance cannot be captured automatically; the analyst must record it).
 */
export function getInsightAnnotations(
  graph: ProvenanceGraph<AutarkProvenanceState>
): InsightAnnotation[] {
  const out: InsightAnnotation[] = [];
  for (const node of graph.nodes.values()) {
    const text = node.metadata?.insight;
    if (typeof text === 'string' && text.trim().length > 0) {
      out.push({
        nodeId: node.id,
        actionLabel: node.actionLabel,
        text: text.trim(),
        timestamp: node.timestamp,
      });
    }
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Feature 4: Auto-Generated Session Narrative
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

/**
 * Generates a human-readable summary of the analysis session.
 *
 * Ragan §4.2.5 (Presentation): among the most under-built purposes in
 * provenance research. The narrative makes the analysis history shareable
 * without requiring the recipient to replay the graph.
 *
 * Elicitation paper: participants naturally form "a story I would try to
 * retell" from their visualization experience. This function makes that
 * story explicit from the provenance record.
 */
export function generateSessionNarrative(
  graph: ProvenanceGraph<AutarkProvenanceState>,
  metrics: GraphMetrics,
  annotations: InsightAnnotation[]
): string {
  const lines: string[] = [];
  const root = graph.nodes.get(graph.rootId);
  const startTime = root ? new Date(root.timestamp).toLocaleTimeString() : '—';

  lines.push(`Session started at ${startTime}.`);
  lines.push(
    `Duration: ${formatDuration(metrics.sessionDurationMs)} across ${metrics.totalNodes} states ` +
      `(avg ${formatDuration(metrics.avgTimePerStateMs)} per state).`
  );

  const strategyDesc: Record<StrategyLabel, string> = {
    Confirmatory: 'A focused, linear exploration — the analyst appeared to know what they were looking for.',
    Exploratory: 'A broad, open-ended investigation with multiple diverging paths.',
    'Iterative Refinement': 'A hypothesis-driven approach with repeated backtracking and revision.',
  };
  lines.push(`\nAnalysis strategy: ${metrics.strategyLabel}`);
  lines.push(strategyDesc[metrics.strategyLabel]);

  if (metrics.branchPoints > 0) {
    lines.push(
      `The analysis diverged at ${metrics.branchPoints} branch point${metrics.branchPoints > 1 ? 's' : ''}, ` +
        `with ${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''} before settling on the current path.`
    );
  }

  // Selection focus (ProWis-inspired: aggregate across all paths)
  const freq = computeSelectionFrequency(graph);
  const topMap = [...freq.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (topMap.length > 0) {
    const items = topMap.map(([id, c]) => `feature #${id} (${c} state${c !== 1 ? 's' : ''})`).join(', ');
    lines.push(`\nMost revisited map features across all branches: ${items}.`);
  }
  for (const [plotId, plotFreq] of freq.plots.entries()) {
    const top = [...plotFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length > 0 && top[0][1] > 1) {
      const items = top.map(([id, c]) => `#${id} (${c}×)`).join(', ');
      lines.push(`Most revisited features in plot "${plotId}": ${items}.`);
    }
  }

  if (annotations.length > 0) {
    lines.push(`\nRecorded insights (${annotations.length}):`);
    for (const a of annotations) {
      lines.push(`  • [${a.actionLabel}] ${a.text}`);
    }
  } else {
    lines.push('\nNo insight annotations were recorded during this session.');
  }

  return lines.join('\n');
}
