import type { ProvenanceGraph, ProvenanceNode } from '../types';

export interface InsightSelectionState {
  selection: {
    map: { layerId: string; ids: number[] } | null;
    plots: Record<string, { ids: number[] }>;
  };
}

export interface InsightsProvenanceApi<T extends InsightSelectionState = InsightSelectionState> {
  getGraph(): ProvenanceGraph<T>;
  getCurrentNode(): ProvenanceNode<T> | null;
  goToNode(nodeId: string): boolean;
  annotateNode(nodeId: string, text: string): boolean;
}

export interface SelectionFrequency {
  map: Map<number, number>;
  plots: Map<string, Map<number, number>>;
}

export type StrategyLabel = 'Confirmatory' | 'Exploratory' | 'Iterative Refinement';

export interface GraphMetrics {
  totalNodes: number;
  branchPoints: number;
  backtracks: number;
  maxDepth: number;
  sessionDurationMs: number;
  avgTimePerStateMs: number;
  branchRatio: number;
  strategyLabel: StrategyLabel;
  insightCount: number;
}

export interface InsightAnnotation {
  nodeId: string;
  actionLabel: string;
  text: string;
  timestamp: number;
}
