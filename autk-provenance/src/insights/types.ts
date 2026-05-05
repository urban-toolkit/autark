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
