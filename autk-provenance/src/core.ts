import type {
  AutarkProvenanceState,
  PathNode,
  ProvenanceGraph,
  ProvenanceNode,
} from './types';
import { ProvenanceAction } from './types';

function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function deepMergeState(
  base: AutarkProvenanceState,
  delta: Partial<AutarkProvenanceState>
): AutarkProvenanceState {
  const next: AutarkProvenanceState = {
    selection: {
      map: delta.selection?.map ?? base.selection.map,
      // Spread-merge so a delta for one plot doesn't wipe the others.
      plots: delta.selection?.plots !== undefined
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
  /**
   * Attaches an insight annotation to any node's metadata without creating a
   * new provenance step. Implements Ragan §4.1.4 (insight provenance): insights
   * cannot be captured automatically — the analyst must record them explicitly.
   */
  annotateNode(nodeId: string, text: string): boolean;
}

export function createProvenanceCore(
  options: ProvenanceCoreOptions
): ProvenanceCoreApi<AutarkProvenanceState> {
  const { initialState } = options;
  const nodes = new Map<string, ProvenanceNode<AutarkProvenanceState>>();
  let rootId = generateId();
  let currentId = rootId;
  const observers: Array<(node: ProvenanceNode<AutarkProvenanceState>) => void> = [];

  const rootNode: ProvenanceNode<AutarkProvenanceState> = {
    id: rootId,
    parentId: null,
    childrenIds: [],
    state: initialState,
    actionLabel: 'Start',
    actionType: ProvenanceAction.ROOT,
    timestamp: Date.now(),
  };
  nodes.set(rootId, rootNode);

  function getCurrent(): ProvenanceNode<AutarkProvenanceState> | null {
    return nodes.get(currentId) ?? null;
  }

  function notify(): void {
    const node = getCurrent();
    if (node) observers.forEach((cb) => cb(node));
  }

  function applyAction(
    actionType: ProvenanceAction | string,
    actionLabel: string,
    stateDelta: Partial<AutarkProvenanceState>
  ): void {
    const current = getCurrent();
    if (!current) return;
    const newState = deepMergeState(current.state, stateDelta);
    const newId = generateId();
    const newNode: ProvenanceNode<AutarkProvenanceState> = {
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
    if (!current || !current.parentId) return false;
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
    const current = getCurrent();
    return !!current?.parentId;
  }

  function canGoForward(): boolean {
    const current = getCurrent();
    return !!current && current.childrenIds.length > 0;
  }

  function getPathFromRoot(): PathNode<AutarkProvenanceState>[] {
    const path: PathNode<AutarkProvenanceState>[] = [];
    let id: string | null = currentId;
    const ordered: ProvenanceNode<AutarkProvenanceState>[] = [];
    while (id) {
      const node = nodes.get(id);
      if (!node) break;
      ordered.push(node);
      id = node.parentId;
    }
    ordered.reverse();
    for (const node of ordered) {
      path.push({
        id: node.id,
        actionLabel: node.actionLabel,
        actionType: node.actionType,
        timestamp: node.timestamp,
        state: node.state,
      });
    }
    return path;
  }

  function getGraph(): ProvenanceGraph<AutarkProvenanceState> {
    return {
      nodes: new Map(nodes),
      rootId,
      currentId,
    };
  }

  function getCurrentState(): AutarkProvenanceState | null {
    return getCurrent()?.state ?? null;
  }

  function exportGraph(): string {
    const graph = getGraph();
    const serializable = {
      rootId: graph.rootId,
      currentId: graph.currentId,
      nodes: Array.from(graph.nodes.entries()),
    };
    return JSON.stringify(serializable);
  }

  function importGraph(json: string): void {
    try {
      const parsed = JSON.parse(json) as {
        rootId: string;
        currentId: string;
        nodes: [string, ProvenanceNode<AutarkProvenanceState>][];
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

  function addObserver(callback: (node: ProvenanceNode<AutarkProvenanceState>) => void): () => void {
    observers.push(callback);
    return () => {
      const i = observers.indexOf(callback);
      if (i !== -1) observers.splice(i, 1);
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

export interface ProvenanceCoreGenericOptions<T> {
  initialState: T;
  mergeState: (base: T, delta: Partial<T>) => T;
}

export function createProvenanceCoreGeneric<T extends Record<string, unknown>>(
  options: ProvenanceCoreGenericOptions<T>
): ProvenanceCoreApi<T> {
  const { initialState, mergeState } = options;
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
    actionType: 'root',
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

  function applyAction(
    actionType: ProvenanceAction | string,
    actionLabel: string,
    stateDelta: Partial<T>
  ): void {
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
    if (!current || !current.parentId) return false;
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
    const current = getCurrent();
    return !!current?.parentId;
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
      // no-op
    }
  }

  function addObserver(callback: (node: ProvenanceNode<T>) => void): () => void {
    observers.push(callback);
    return () => {
      const i = observers.indexOf(callback);
      if (i !== -1) observers.splice(i, 1);
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
