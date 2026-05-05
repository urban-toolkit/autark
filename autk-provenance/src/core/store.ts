import type { PathNode, ProvenanceNode } from '../types';
import type { ProvenanceCoreApi, ProvenanceCoreOptions } from './api';
import { generateNodeId } from './state';

type SerializableGraph<T> = {
  rootId: string;
  currentId: string;
  nodes: [string, ProvenanceNode<T>][];
};

export function createProvenanceCoreStore<T>(
  options: ProvenanceCoreOptions<T>
): ProvenanceCoreApi<T> {
  const { initialState, mergeState, rootActionType } = options;
  const nodes = new Map<string, ProvenanceNode<T>>();
  let rootId = generateNodeId();
  let currentId = rootId;
  const observers: Array<(node: ProvenanceNode<T>) => void> = [];

  nodes.set(rootId, {
    id: rootId,
    parentId: null,
    childrenIds: [],
    state: initialState,
    actionLabel: 'Start',
    actionType: rootActionType,
    timestamp: Date.now(),
  });

  function getCurrentNode(): ProvenanceNode<T> | null {
    return nodes.get(currentId) ?? null;
  }

  function notifyObservers(): void {
    const node = getCurrentNode();
    if (node) observers.forEach((callback) => callback(node));
  }

  function applyAction(actionType: string, actionLabel: string, stateDelta: Partial<T>): void {
    const current = getCurrentNode();
    if (!current) return;

    const nextId = generateNodeId();
    nodes.set(nextId, {
      id: nextId,
      parentId: currentId,
      childrenIds: [],
      state: mergeState(current.state, stateDelta),
      actionLabel,
      actionType,
      timestamp: Date.now(),
    });
    current.childrenIds.push(nextId);
    currentId = nextId;
    notifyObservers();
  }

  function getPathFromRoot(): PathNode<T>[] {
    const ordered: ProvenanceNode<T>[] = [];
    let nodeId: string | null = currentId;
    while (nodeId) {
      const node = nodes.get(nodeId);
      if (!node) break;
      ordered.push(node);
      nodeId = node.parentId;
    }

    return ordered.reverse().map((node) => ({
      id: node.id,
      actionLabel: node.actionLabel,
      actionType: node.actionType,
      timestamp: node.timestamp,
      state: node.state,
    }));
  }

  function importGraph(json: string): void {
    try {
      const parsed = JSON.parse(json) as SerializableGraph<T>;
      nodes.clear();
      parsed.nodes.forEach(([id, node]) => nodes.set(id, node));
      rootId = parsed.rootId;
      currentId = parsed.currentId;
      notifyObservers();
    } catch {
      // Preserve the existing graph when the import payload is invalid.
    }
  }

  return {
    applyAction,
    goToNode: (nodeId) => {
      if (!nodes.has(nodeId)) return false;
      currentId = nodeId;
      notifyObservers();
      return true;
    },
    goBackOneStep: () => {
      const parentId = getCurrentNode()?.parentId;
      if (!parentId) return false;
      currentId = parentId;
      notifyObservers();
      return true;
    },
    goForwardOneStep: () => {
      const children = getCurrentNode()?.childrenIds ?? [];
      const nextId = children[children.length - 1];
      if (!nextId) return false;
      currentId = nextId;
      notifyObservers();
      return true;
    },
    canGoBack: () => !!getCurrentNode()?.parentId,
    canGoForward: () => !!getCurrentNode()?.childrenIds.length,
    getPathFromRoot,
    getGraph: () => ({ nodes: new Map(nodes), rootId, currentId }),
    getCurrentNode,
    getCurrentState: () => getCurrentNode()?.state ?? null,
    exportGraph: () => JSON.stringify({ rootId, currentId, nodes: Array.from(nodes.entries()) }),
    importGraph,
    addObserver: (callback) => {
      observers.push(callback);
      return () => {
        const index = observers.indexOf(callback);
        if (index !== -1) observers.splice(index, 1);
      };
    },
    annotateNode: (nodeId, text) => {
      const node = nodes.get(nodeId);
      if (!node) return false;
      node.metadata = { ...(node.metadata ?? {}), insight: text };
      return true;
    },
  };
}
