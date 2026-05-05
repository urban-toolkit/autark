import type { PathNode, ProvenanceGraph, ProvenanceNode } from '../types';

export interface ProvenanceCoreOptions<T> {
  initialState: T;
  mergeState: (base: T, delta: Partial<T>) => T;
  rootActionType: string;
}

export interface ProvenanceCoreApi<T> {
  applyAction(actionType: string, actionLabel: string, stateDelta: Partial<T>): void;
  goToNode(nodeId: string): boolean;
  goBackOneStep(): boolean;
  goForwardOneStep(): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getPathFromRoot(): PathNode<T>[];
  getGraph(): ProvenanceGraph<T>;
  getCurrentNode(): ProvenanceNode<T> | null;
  getCurrentState(): T | null;
  exportGraph(): string;
  importGraph(json: string): void;
  addObserver(callback: (node: ProvenanceNode<T>) => void): () => void;
  annotateNode(nodeId: string, text: string): boolean;
}
