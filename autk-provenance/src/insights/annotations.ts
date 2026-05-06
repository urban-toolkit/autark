import type { ProvenanceGraph } from '../types';
import type { InsightAnnotation } from './types';

export function getInsightAnnotations<T>(graph: ProvenanceGraph<T>): InsightAnnotation[] {
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
