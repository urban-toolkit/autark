import type { AutarkProvenanceState, IMapForProvenance, MapViewState } from '../types';
import { ProvenanceAction } from '../types';
import {
  resolveMapSelectors,
  type CustomControlConfig,
  type MapAdapterApi,
  type MapRecordCallback,
  type MapSelectorConfig,
} from './map-adapter-shared';
import { createMapUiHelpers } from './map-ui-helpers';
import { applyMapProvenanceState } from './map-adapter-state';
import { bindCustomControlEvent } from './map-adapter-recording';
import { isElement } from './map-adapter-shared';
const MAP_PICK_EVENT = 'pick';
export type { CustomControlConfig, MapAdapterApi, MapRecordCallback, MapSelectorConfig };

export function createMapAdapter(
  map: IMapForProvenance,
  onRecord: MapRecordCallback,
  selectorConfig?: MapSelectorConfig
): MapAdapterApi {
  const { selectors, customControls } = resolveMapSelectors(selectorConfig);
  const mapObj = map as unknown as Record<string, unknown>;
  const ui = createMapUiHelpers(map, selectors, customControls);

  let pickListener: ((selection: number[], layerId: string) => void) | null = null;
  let viewListener: ((state: MapViewState) => void) | null = null;
  let clickListener: ((event: Event) => void) | null = null;
  let changeListener: ((event: Event) => void) | null = null;
  let isApplyingState = false;
  let currentState: AutarkProvenanceState = { selection: { map: null, plots: {} } };
  const wrappedMapMethods = new Map<string, unknown>();

  function recordUiEvent(
    actionType: ProvenanceAction,
    actionLabel: string,
    overrides: Partial<NonNullable<AutarkProvenanceState['ui']>> = {}
  ): void {
    onRecord(actionType, actionLabel, ui.buildUiDelta(overrides));
  }

  function wrapMapMethod(methodName: string, onAfter: (args: unknown[]) => void): void {
    const current = mapObj[methodName];
    if (typeof current !== 'function' || wrappedMapMethods.has(methodName)) return;
    const original = current;
    wrappedMapMethods.set(methodName, original);

    mapObj[methodName] = function (...args: unknown[]) {
      const result = (original as (...a: unknown[]) => unknown).apply(this, args);
      if (!isApplyingState) {
        onAfter(args);
      }
      return result;
    };
  }

  function restoreWrappedMapMethods(): void {
    for (const [methodName, original] of wrappedMapMethods.entries()) {
      mapObj[methodName] = original;
    }
    wrappedMapMethods.clear();
  }

  function startRecording(): void {
    if (pickListener || clickListener || changeListener) return;

    wrapMapMethod('init', () => {
      onRecord(ProvenanceAction.MAP_INIT, 'Map initialized', ui.buildUiDelta());
    });
    wrapMapMethod('loadGeoJsonLayer', (args) => {
      const [layerName] = args;
      const name = typeof layerName === 'string' ? layerName : 'layer';
      onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Map layer loaded: ${name}`, ui.buildUiDelta());
    });
    wrapMapMethod('loadGeoTiffLayer', (args) => {
      const [layerName] = args;
      const name = typeof layerName === 'string' ? layerName : 'raster';
      onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Raster layer loaded: ${name}`, ui.buildUiDelta());
    });

    pickListener = (selection: number[], layerId: string) => {
      const activePlotIds = new Set(
        Object.values(currentState.selection?.plots ?? {}).flatMap((plotState) => plotState.ids)
      );
      const mapOwnedSelection = selection.filter((id) => !activePlotIds.has(id));
      const label =
        mapOwnedSelection.length === 0
          ? `Cleared selection on ${layerId}`
          : `Picked ${mapOwnedSelection.length} feature(s) on ${layerId}`;
      onRecord(ProvenanceAction.MAP_PICK, label, {
        selection: {
          map: { layerId, ids: mapOwnedSelection },
          plots: {},
        },
      });
    };
    map.mapEvents.addEventListener(MAP_PICK_EVENT, pickListener);

    if (map.addViewListener) {
      viewListener = (viewState: MapViewState) => {
        if (isApplyingState) return;
        const alt = viewState.eye[2].toFixed(0);
        onRecord(ProvenanceAction.MAP_VIEW, `View changed (alt: ${alt})`, { view: viewState });
      };
      map.addViewListener(viewListener);
    }

    if (typeof document === 'undefined') return;

    clickListener = (event: Event) => {
      if (isApplyingState) return;
      const target = event.target;
      if (!isElement(target)) return;
      if (bindCustomControlEvent(customControls, 'click', target, onRecord)) return;
      if (!ui.inMapContainer(target)) return;

      if (target.closest(selectors.menuIcon)) {
        const isOpen = !!ui.buildUiDelta().ui?.mapMenuOpen;
        recordUiEvent(ProvenanceAction.MAP_UI_MENU_TOGGLE, isOpen ? 'Opened map menu' : 'Closed map menu', {
          mapMenuOpen: isOpen,
        });
      }
    };
    document.addEventListener('click', clickListener);

    changeListener = (event: Event) => {
      if (isApplyingState) return;
      const target = event.target;
      if (!isElement(target)) return;
      if (bindCustomControlEvent(customControls, 'change', target, onRecord)) return;
      if (!ui.inMapContainer(target)) return;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.id === selectors.thematicCheckbox.replace(/^#/, '')) {
        recordUiEvent(ProvenanceAction.MAP_UI_THEMATIC_TOGGLE, target.checked ? 'Enabled thematic legend' : 'Disabled thematic legend', {
          thematicEnabled: target.checked,
        });
        return;
      }

      if (target.classList.contains(selectors.activeLayerRadioClass.replace(/^\./, ''))) {
        const activeLayerId = ui.getActiveLayerId() ?? target.value;
        recordUiEvent(ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE, `Active layer: ${activeLayerId}`, {
          activeLayerId,
        });
        return;
      }

      const listSel = selectors.visibleLayerList.replace(/^#/, '');
      if (target.type === 'checkbox' && target.closest(`#${listSel}`)) {
        const layerId = target.value || 'layer';
        recordUiEvent(ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE, target.checked ? `Show layer: ${layerId}` : `Hide layer: ${layerId}`, {
          visibleLayerIds: ui.getVisibleLayerIds(),
        });
      }
    };
    document.addEventListener('change', changeListener);
  }

  function stopRecording(): void {
    if (pickListener && map.mapEvents.removeEventListener) {
      map.mapEvents.removeEventListener(MAP_PICK_EVENT, pickListener);
      pickListener = null;
    }
    if (viewListener && map.removeViewListener) {
      map.removeViewListener(viewListener);
      viewListener = null;
    }
    if (clickListener && typeof document !== 'undefined') {
      document.removeEventListener('click', clickListener);
      clickListener = null;
    }
    if (changeListener && typeof document !== 'undefined') {
      document.removeEventListener('change', changeListener);
      changeListener = null;
    }
    restoreWrappedMapMethods();
  }

  function applyState(state: AutarkProvenanceState): void {
    isApplyingState = true;
    try {
      currentState = state;
      applyMapProvenanceState(map, ui, selectors, state);
    } finally {
      isApplyingState = false;
    }
  }

  return {
    startRecording,
    stopRecording,
    applyState,
  };
}
