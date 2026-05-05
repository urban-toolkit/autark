import type { PathNode, ProvenanceGraph, ProvenanceNode } from './types';

export interface GraphEngineOptions<T> {
  initialState: T;
  rootActionType: string;
  mergeState: (base: T, delta: Partial<T>) => T;
  generateId: () => string;
}

export interface GraphEngineApi<T> {
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

export function createGraphEngine<T>(options: GraphEngineOptions<T>): GraphEngineApi<T> {
  const { initialState, rootActionType, mergeState, generateId } = options;
  const nodes = new Map<string, ProvenanceNode<T>>();
  let rootId = generateId();
  let currentId = rootId;
  const observers: Array<(node: ProvenanceNode<T>) => void> = [];

  const rootNode: ProvenanceNode<T> = {
    id: rootId,
    parentId: null,
    childrenIds: [],
    state: initialState,
    actionLabel: 'Start',
    actionType: rootActionType,
    timestamp: Date.now(),
  };
  nodes.set(rootId, rootNode);

  function getCurrent(): ProvenanceNode<T> | null {
    return nodes.get(currentId) ?? null;
  }

  function notify(): void {
    const node = getCurrent();
    if (node) observers.forEach((cb) => cb(node));
  }

  function applyAction(actionType: string, actionLabel: string, stateDelta: Partial<T>): void {
    const current = getCurrent();
    if (!current) return;
    const newState = mergeState(current.state, stateDelta);
    const newId = generateId();
    const newNode: ProvenanceNode<T> = {
      id: newId,
      parentId: currentId,
      childrenIds: [],
      state: newState,
      actionLabel,
      actionType,
      timestamp: Date.now(),
    };
    nodes.set(newId, newNode);
    current.childrenIds.push(newId);
    currentId = newId;
    notify();
  }

  function goToNode(nodeId: string): boolean {
    if (!nodes.has(nodeId)) return false;
    currentId = nodeId;
    notify();
    return true;
  }

  function goBackOneStep(): boolean {
    const current = getCurrent();
    if (!current?.parentId) return false;
    currentId = current.parentId;
    notify();
    return true;
  }

  function goForwardOneStep(): boolean {
    const current = getCurrent();
    if (!current || current.childrenIds.length === 0) return false;
    currentId = current.childrenIds[current.childrenIds.length - 1];
    notify();
    return true;
  }

  function canGoBack(): boolean {
    return !!getCurrent()?.parentId;
  }

  function canGoForward(): boolean {
    const current = getCurrent();
    return !!current && current.childrenIds.length > 0;
  }

  function getPathFromRoot(): PathNode<T>[] {
    const ordered: ProvenanceNode<T>[] = [];
    let id: string | null = currentId;
    while (id) {
      const node = nodes.get(id);
      if (!node) break;
      ordered.push(node);
      id = node.parentId;
    }
    ordered.reverse();
    return ordered.map((node) => ({
      id: node.id,
      actionLabel: node.actionLabel,
      actionType: node.actionType,
      timestamp: node.timestamp,
      state: node.state,
    }));
  }

  function getGraph(): ProvenanceGraph<T> {
    return {
      nodes: new Map(nodes),
      rootId,
      currentId,
    };
  }

  function getCurrentState(): T | null {
    return getCurrent()?.state ?? null;
  }

  function exportGraph(): string {
    const graph = getGraph();
    return JSON.stringify({
      rootId: graph.rootId,
      currentId: graph.currentId,
      nodes: Array.from(graph.nodes.entries()),
    });
  }

  function importGraph(json: string): void {
    try {
      const parsed = JSON.parse(json) as {
        rootId: string;
        currentId: string;
        nodes: [string, ProvenanceNode<T>][];
      };
      nodes.clear();
      for (const [id, node] of parsed.nodes) {
        nodes.set(id, node);
      }
      rootId = parsed.rootId;
      currentId = parsed.currentId;
      notify();
    } catch {
      // no-op on invalid JSON
    }
  }

  function addObserver(callback: (node: ProvenanceNode<T>) => void): () => void {
    observers.push(callback);
    return () => {
      const index = observers.indexOf(callback);
      if (index !== -1) observers.splice(index, 1);
    };
  }

  function annotateNode(nodeId: string, text: string): boolean {
    const node = nodes.get(nodeId);
    if (!node) return false;
    node.metadata = { ...(node.metadata ?? {}), insight: text };
    return true;
  }

  return {
    applyAction,
    goToNode,
    goBackOneStep,
    goForwardOneStep,
    canGoBack,
    canGoForward,
    getPathFromRoot,
    getGraph,
    getCurrentNode: getCurrent,
    getCurrentState,
    exportGraph,
    importGraph,
    addObserver,
    annotateNode,
  };
}
