import type { AutarkProvenanceState, ProvenanceGraph } from '../types';
import type { InsightAnnotation } from './types';

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
