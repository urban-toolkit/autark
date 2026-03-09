/**
 * Canonical state shape for autark provenance.
 * Captures everything needed to restore the current analysis state.
 */
export interface AutarkProvenanceState {
  selection: {
    map: { layerId: string; ids: number[] } | null;
    plot: number[];
  };
  view?: {
    center: [number, number];
    zoom?: number;
    pitch?: number;
  };
  data?: {
    workspace: string;
    layerTableNames: string[];
    activeLayerIds?: string[];
  };
}

/**
 * Action types for every trackable interaction.
 * Each creates one node in the provenance graph.
 */
export enum ProvenanceAction {
  ROOT = 'root',
  MAP_PICK = 'MAP_PICK',
  MAP_LAYER_LOAD = 'MAP_LAYER_LOAD',
  MAP_VIEW = 'MAP_VIEW',
  PLOT_CLICK = 'PLOT_CLICK',
  PLOT_BRUSH = 'PLOT_BRUSH',
  PLOT_BRUSH_X = 'PLOT_BRUSH_X',
  PLOT_BRUSH_Y = 'PLOT_BRUSH_Y',
  PLOT_DATA = 'PLOT_DATA',
  DB_WORKSPACE = 'DB_WORKSPACE',
  DB_LOAD_OSM = 'DB_LOAD_OSM',
  DB_LOAD_CSV = 'DB_LOAD_CSV',
  DB_LOAD_JSON = 'DB_LOAD_JSON',
  DB_LOAD_CUSTOM_LAYER = 'DB_LOAD_CUSTOM_LAYER',
  DB_LOAD_GRID_LAYER = 'DB_LOAD_GRID_LAYER',
  DB_SPATIAL_JOIN = 'DB_SPATIAL_JOIN',
  DB_UPDATE_TABLE = 'DB_UPDATE_TABLE',
  DB_DROP_TABLE = 'DB_DROP_TABLE',
  DB_OTHER = 'DB_OTHER',
}

export interface ProvenanceNode<T = AutarkProvenanceState> {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  state: T;
  actionLabel: string;
  actionType: ProvenanceAction | string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceGraph<T = AutarkProvenanceState> {
  nodes: Map<string, ProvenanceNode<T>>;
  rootId: string;
  currentId: string;
}

/**
 * Adapter contract for applying state to a system (e.g. map, plot, db).
 * Used when navigating to a node: core calls applyState with that node's state.
 */
export interface ProvenanceAdapter<T> {
  applyState(state: T): void;
}

/**
 * Minimal map-like interface needed by MapAdapter (avoids tight coupling to AutkMap).
 */
export interface IMapForProvenance {
  mapEvents: {
    addEventListener(event: string, listener: (selection: number[], layerId: string) => void): void;
    removeEventListener?(event: string, listener: (selection: number[], layerId: string) => void): void;
  };
  layerManager: {
    searchByLayerId(layerId: string): { setHighlightedIds(ids: number[]): void; clearHighlightedIds(): void; layerInfo?: { id: string } } | null;
    vectorLayers?: Array<{ layerInfo?: { id: string }; setHighlightedIds(ids: number[]): void; clearHighlightedIds(): void }>;
  };
}

/**
 * Minimal plot-like interface needed by PlotAdapter.
 */
export interface IPlotForProvenance {
  plotEvents: {
    addEventListener(event: string, listener: (selection: number[]) => void): void;
    removeEventListener?(event: string, listener: (selection: number[]) => void): void;
  };
  setHighlightedIds(selection: number[]): void;
}

/**
 * Path entry for getPathFromRoot().
 */
export interface PathNode<T = AutarkProvenanceState> {
  id: string;
  actionLabel: string;
  actionType: ProvenanceAction | string;
  timestamp: number;
  state: T;
}
