import type { ProvenanceAdapter } from './types';
import { createProvenanceCoreGeneric } from './core';
import type { ProvenanceNode } from './types';

export interface CreateProvenanceOptions<T> {
  initialState: T;
  adapter: ProvenanceAdapter<T>;
  mergeState?: (base: T, delta: Partial<T>) => T;
}

export interface ProvenanceApi<T> {
  applyAction(actionType: string, actionLabel: string, stateDelta: Partial<T>): void;
  goToNode(nodeId: string): boolean;
  goBackOneStep(): boolean;
  goForwardOneStep(): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getPathFromRoot(): Array<{ id: string; actionLabel: string; actionType: string; timestamp: number; state: T }>;
  getGraph(): { nodes: Map<string, ProvenanceNode<T>>; rootId: string; currentId: string };
  getCurrentNode(): ProvenanceNode<T> | null;
  getCurrentState(): T | null;
  exportGraph(): string;
  importGraph(json: string): void;
  addObserver(callback: (node: ProvenanceNode<T>) => void): () => void;
}

function defaultMerge<T>(base: T, delta: Partial<T>): T {
  return { ...base, ...delta };
}

export function createProvenance<T extends Record<string, unknown>>(
  options: CreateProvenanceOptions<T>
): ProvenanceApi<T> {
  const { initialState, adapter, mergeState = defaultMerge } = options;

  const core = createProvenanceCoreGeneric<T>({
    initialState,
    mergeState,
  });

  core.addObserver((node) => {
    adapter.applyState(node.state);
  });

  return {
    applyAction: core.applyAction.bind(core),
    goToNode: core.goToNode.bind(core),
    goBackOneStep: core.goBackOneStep.bind(core),
    goForwardOneStep: core.goForwardOneStep.bind(core),
    canGoBack: core.canGoBack.bind(core),
    canGoForward: core.canGoForward.bind(core),
    getPathFromRoot: core.getPathFromRoot.bind(core),
    getGraph: core.getGraph.bind(core),
    getCurrentNode: core.getCurrentNode.bind(core),
    getCurrentState: core.getCurrentState.bind(core),
    exportGraph: core.exportGraph.bind(core),
    importGraph: core.importGraph.bind(core),
    addObserver: core.addObserver.bind(core),
  };
}
