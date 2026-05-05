import type { AutarkProvenanceState, PathNode, ProvenanceGraph, ProvenanceNode } from './types';
import { ProvenanceAction } from './types';
import { createGraphEngine } from './core-engine';

function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function deepMergeState(
  base: AutarkProvenanceState,
  delta: Partial<AutarkProvenanceState>
): AutarkProvenanceState {
  const hasSelectionMap =
    delta.selection !== undefined &&
    Object.prototype.hasOwnProperty.call(delta.selection, 'map');

  const next: AutarkProvenanceState = {
    selection: {
      map: hasSelectionMap ? (delta.selection?.map ?? null) : base.selection.map,
      plots:
        delta.selection?.plots !== undefined
          ? { ...base.selection.plots, ...delta.selection.plots }
          : base.selection.plots,
    },
  };

  if (base.ui || delta.ui) {
    next.ui = {
      ...(base.ui ?? {}),
      ...(delta.ui ?? {}),
    };
  }
  if (base.view || delta.view) next.view = delta.view ?? base.view;
  if (base.data || delta.data) next.data = delta.data ?? base.data;
  if (base.filters || delta.filters) {
    next.filters = { ...(base.filters ?? {}), ...(delta.filters ?? {}) };
  }
  return next;
}

export interface ProvenanceCoreOptions {
  initialState: AutarkProvenanceState;
}

export interface ProvenanceCoreApi<T = AutarkProvenanceState> {
  applyAction(
    actionType: ProvenanceAction | string,
    actionLabel: string,
    stateDelta: Partial<T>
  ): void;
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

export function createProvenanceCore(
  options: ProvenanceCoreOptions
): ProvenanceCoreApi<AutarkProvenanceState> {
  return createGraphEngine<AutarkProvenanceState>({
    initialState: options.initialState,
    rootActionType: ProvenanceAction.ROOT,
    mergeState: deepMergeState,
    generateId,
  });
}

export interface ProvenanceCoreGenericOptions<T> {
  initialState: T;
  mergeState: (base: T, delta: Partial<T>) => T;
}

export function createProvenanceCoreGeneric<T extends Record<string, unknown>>(
  options: ProvenanceCoreGenericOptions<T>
): ProvenanceCoreApi<T> {
  return createGraphEngine<T>({
    initialState: options.initialState,
    rootActionType: 'root',
    mergeState: options.mergeState,
    generateId,
  });
}
