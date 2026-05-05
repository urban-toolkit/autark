import type { AutarkProvenanceState, ProvenanceGraph } from '../types';

export interface InsightAnnotation {
  nodeId: string;
  actionLabel: string;
  text: string;
  timestamp: number;
}

export function getInsightAnnotations(
  graph: ProvenanceGraph<AutarkProvenanceState>
): InsightAnnotation[] {
  const annotations: InsightAnnotation[] = [];

  for (const node of graph.nodes.values()) {
    const text = node.metadata?.insight;
    if (typeof text === 'string' && text.trim().length > 0) {
      annotations.push({
        nodeId: node.id,
        actionLabel: node.actionLabel,
        text: text.trim(),
        timestamp: node.timestamp,
      });
    }
  }

  return annotations.sort((a, b) => a.timestamp - b.timestamp);
}
