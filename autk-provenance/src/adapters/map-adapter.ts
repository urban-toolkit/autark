import type { AutarkProvenanceState, IMapForProvenance } from '../types';
import { createMapRecordingController } from './map/recording';
import { applyMapState } from './map/state';
import type { CustomControlConfig, MapRecordCallback, MapSelectorConfig } from './map/types';
import { getActiveLayerId, getMenuOpen, getThematicEnabled, getVisibleLayerIds, resolveMapSelectors } from './map/utils';

export type { CustomControlConfig, MapRecordCallback, MapSelectorConfig } from './map/types';

export interface MapAdapterApi {
  startRecording(): void;
  stopRecording(): void;
  applyState(state: AutarkProvenanceState): void;
}

export function createMapAdapter(
  map: IMapForProvenance,
  onRecord: MapRecordCallback,
  selectorConfig?: MapSelectorConfig
): MapAdapterApi {
  const selectors = resolveMapSelectors(selectorConfig);
  const customControls: CustomControlConfig[] = selectorConfig?.customControls ?? [];
  let isApplyingState = false;
  let currentState: AutarkProvenanceState = { selection: { map: null, plots: {} } };
  const buildUiDelta = (overrides: Partial<NonNullable<AutarkProvenanceState['ui']>> = {}) => ({
    ui: {
      mapMenuOpen: getMenuOpen(map, selectors),
      activeLayerId: getActiveLayerId(map),
      visibleLayerIds: getVisibleLayerIds(map),
      thematicEnabled: getThematicEnabled(map),
      ...overrides,
    },
  });
  const recording = createMapRecordingController({
    map,
    selectors,
    customControls,
    onRecord,
    getCurrentState: () => currentState,
    isApplyingState: () => isApplyingState,
    buildUiDelta,
  });

  return {
    startRecording: recording.start,
    stopRecording: recording.stop,
    applyState: (state) => {
      currentState = state;
      applyMapState({ map, selectors, customControls, state, setApplyingState: (value) => { isApplyingState = value; } });
    },
  };
}
