import type { AutarkProvenanceState } from './types';
import { createProvenanceCore } from './core';
import { createMapAdapter } from './adapters/map-adapter';
import { createPlotAdapter } from './adapters/plot-adapter';
import { createDbAdapter } from './adapters/db-adapter';
import { createComputeAdapter } from './adapters/compute-adapter';
import type { IMapForProvenance, IPlotForProvenance } from './types';
import type { IDbForProvenance } from './adapters/db-adapter';
import type { IComputeForProvenance } from './adapters/compute-adapter';
import type { MapSelectorConfig } from './adapters/map-adapter';

const DEFAULT_STATE: AutarkProvenanceState = {
  selection: {
    map: null,
    plots: {},
  },
  ui: {
    mapMenuOpen: false,
    activeLayerId: null,
    thematicEnabled: false,
  },
};

export interface CreateAutarkProvenanceOptions {
  map?: IMapForProvenance;
  /** All plot instances to track. Each must have a unique plotId and a plotType. */
  plots?: IPlotForProvenance[];
  db?: IDbForProvenance;
  /** autk-compute GeojsonCompute instance (or compatible object) to track. */
  compute?: IComputeForProvenance;
  /**
   * Override the CSS selectors the map adapter uses to locate standard map UI,
   * and/or register custom DOM controls (dropdowns, buttons, sliders) for tracking.
   */
  mapConfig?: MapSelectorConfig;
  initialState?: Partial<AutarkProvenanceState>;
}

export interface AutarkProvenanceApi {
  goToNode(nodeId: string): boolean;
  goBackOneStep(): boolean;
  goForwardOneStep(): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getPathFromRoot(): import('./types').PathNode<AutarkProvenanceState>[];
  getGraph(): import('./types').ProvenanceGraph<AutarkProvenanceState>;
  getCurrentNode(): import('./types').ProvenanceNode<AutarkProvenanceState> | null;
  getCurrentState(): AutarkProvenanceState | null;
  exportGraph(): string;
  importGraph(json: string): void;
  addObserver(callback: (node: import('./types').ProvenanceNode<AutarkProvenanceState>) => void): () => void;
  /** Attach an insight annotation to any node without creating a new provenance step. */
  annotateNode(nodeId: string, text: string): boolean;
  stopRecording(): void;
  startRecording(): void;
  db?: import('./adapters/db-adapter').DbAdapterApi;
}

export function createAutarkProvenance(options: CreateAutarkProvenanceOptions): AutarkProvenanceApi {
  const { map, plots, db, compute, mapConfig, initialState: initialPartial } = options;
  const initialState: AutarkProvenanceState = {
    selection: {
      map: initialPartial?.selection?.map ?? DEFAULT_STATE.selection.map,
      plots: initialPartial?.selection?.plots ?? { ...DEFAULT_STATE.selection.plots },
    },
    ui: {
      ...(DEFAULT_STATE.ui ?? {}),
      ...(initialPartial?.ui ?? {}),
    },
  };
  if (initialPartial?.view) initialState.view = initialPartial.view;
  if (initialPartial?.data) initialState.data = initialPartial.data;
  if (initialPartial?.filters) initialState.filters = { ...initialPartial.filters };

  const core = createProvenanceCore({ initialState });

  const mapAdapter = map
    ? createMapAdapter(map, (actionType, label, delta) => {
        core.applyAction(actionType, label, delta);
      }, mapConfig)
    : null;

  const plotAdapter = plots && plots.length > 0
    ? createPlotAdapter(plots, (actionType, label, delta) => {
        core.applyAction(actionType, label, delta);
      })
    : null;

  const dbAdapter = db
    ? createDbAdapter(db, (actionType, label, delta) => {
        core.applyAction(actionType, label, delta);
      })
    : null;

  const computeAdapter = compute
    ? createComputeAdapter(compute, (actionType, label, delta) => {
        core.applyAction(actionType, label, delta);
      })
    : null;

  core.addObserver((node) => {
    const state = node.state;
    mapAdapter?.applyState(state);
    plotAdapter?.applyState(state);
    if (dbAdapter) {
      dbAdapter.applyState(state).catch(() => {});
    }
  });

  function stopRecording(): void {
    mapAdapter?.stopRecording();
    plotAdapter?.stopRecording();
    dbAdapter?.stopRecording();
    computeAdapter?.stopRecording();
  }

  function startRecording(): void {
    mapAdapter?.startRecording();
    plotAdapter?.startRecording();
    dbAdapter?.startRecording();
    computeAdapter?.startRecording();
  }

  startRecording();

  return {
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
    annotateNode: core.annotateNode.bind(core),
    stopRecording,
    startRecording,
    db: dbAdapter ?? undefined,
  };
}
