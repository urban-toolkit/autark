import type { AutarkProvenanceState } from '../types';

export function generateNodeId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function mergeAutarkProvenanceState(
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

  if (base.ui || delta.ui) next.ui = { ...(base.ui ?? {}), ...(delta.ui ?? {}) };
  if (base.view || delta.view) next.view = delta.view ?? base.view;
  if (base.data || delta.data) next.data = delta.data ?? base.data;
  if (base.filters || delta.filters) {
    next.filters = { ...(base.filters ?? {}), ...(delta.filters ?? {}) };
  }

  return next;
}
