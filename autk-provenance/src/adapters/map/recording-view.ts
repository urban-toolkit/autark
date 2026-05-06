import type { AutarkProvenanceState, MapViewState } from '../../types';
import { ProvenanceAction } from '../../types';
import type { MapRecordCallback } from './types';
import { viewsEqual } from './recording-shared';

const MAP_VIEW_DEBOUNCE_MS = 180;

export function createViewRecorder(
  onRecord: MapRecordCallback,
  getCurrentState: () => AutarkProvenanceState,
  isApplyingState: () => boolean,
): {
  schedule(viewState: MapViewState): void;
  stop(): void;
} {
  let pendingViewState: MapViewState | null = null;
  let viewTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPendingViewState = () => {
    if (!pendingViewState || isApplyingState()) return;
    const nextViewState = pendingViewState;
    pendingViewState = null;
    if (viewsEqual(getCurrentState().view, nextViewState)) return;
    onRecord(ProvenanceAction.MAP_VIEW, `View changed (alt: ${nextViewState.eye[2].toFixed(0)})`, { view: nextViewState });
  };

  return {
    schedule(viewState: MapViewState) {
      pendingViewState = {
        eye: [...viewState.eye] as [number, number, number],
        lookAt: [...viewState.lookAt] as [number, number, number],
        up: [...viewState.up] as [number, number, number],
      };
      if (viewTimer) clearTimeout(viewTimer);
      viewTimer = setTimeout(() => {
        viewTimer = null;
        flushPendingViewState();
      }, MAP_VIEW_DEBOUNCE_MS);
    },
    stop() {
      if (viewTimer) {
        clearTimeout(viewTimer);
        viewTimer = null;
      }
      pendingViewState = null;
    },
  };
}
