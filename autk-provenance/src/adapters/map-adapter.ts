import type { AutarkProvenanceState, IMapForProvenance, MapViewState } from '../types';
import { ProvenanceAction } from '../types';

const MAP_PICK_EVENT = 'pick';

type LayerLike = {
  layerInfo?: { id: string };
  setHighlightedIds?(ids: number[]): void;
  clearHighlightedIds?(): void;
  layerRenderInfo?: { isSkip?: boolean; isColorMap?: boolean };
};

type ResolvedUiState = {
  mapMenuOpen: boolean;
  activeLayerId: string | null;
  visibleLayerIds: string[];
  thematicEnabled: boolean;
};

export type MapRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

export interface MapAdapterApi {
  startRecording(): void;
  stopRecording(): void;
  applyState(state: AutarkProvenanceState): void;
}

function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && 'nodeType' in value;
}

export function createMapAdapter(
  map: IMapForProvenance,
  onRecord: MapRecordCallback
): MapAdapterApi {
  const mapObj = map as unknown as Record<string, unknown>;
  let pickListener: ((selection: number[], layerId: string) => void) | null = null;
  let viewListener: ((state: MapViewState) => void) | null = null;
  let clickListener: ((event: Event) => void) | null = null;
  let changeListener: ((event: Event) => void) | null = null;
  let isApplyingState = false;

  const wrappedMapMethods = new Map<string, unknown>();

  function getAllLayers(): LayerLike[] {
    return [...(map.layerManager.vectorLayers ?? []), ...(map.layerManager.rasterLayers ?? [])] as LayerLike[];
  }

  function getVisibleLayerIds(): string[] {
    return getAllLayers()
      .filter((layer) => !layer.layerRenderInfo?.isSkip)
      .map((layer) => layer.layerInfo?.id)
      .filter((id): id is string => typeof id === 'string');
  }

  function getActiveLayerId(): string | null {
    return map.ui?.activeLayer?.layerInfo?.id ?? null;
  }

  function getThematicEnabled(): boolean {
    return !!map.ui?.activeLayer?.layerRenderInfo?.isColorMap;
  }

  function getMenuOpen(): boolean {
    const parent = map.canvas.parentElement;
    if (!parent) return false;
    const submenu = parent.querySelector('#autkMapSubMenu') as HTMLElement | null;
    return submenu ? submenu.style.visibility === 'visible' : false;
  }

  function getAllLayerIds(): string[] {
    return getAllLayers()
      .map((layer) => layer.layerInfo?.id)
      .filter((id): id is string => typeof id === 'string');
  }

  function getDefaultActiveLayerId(): string | null {
    return getActiveLayerId() ?? map.layerManager.vectorLayers?.[0]?.layerInfo?.id ?? null;
  }

  function resolveUiState(ui: AutarkProvenanceState['ui']): ResolvedUiState {
    const allLayerIds = getAllLayerIds();
    return {
      mapMenuOpen: ui?.mapMenuOpen ?? false,
      activeLayerId: ui?.activeLayerId ?? getDefaultActiveLayerId(),
      visibleLayerIds: Array.isArray(ui?.visibleLayerIds) ? ui.visibleLayerIds : allLayerIds,
      thematicEnabled: ui?.thematicEnabled ?? false,
    };
  }

  function setLayerRenderFlag(layerId: string, property: 'isSkip' | 'isColorMap', value: boolean): void {
    if (map.updateRenderInfoProperty) {
      map.updateRenderInfoProperty(layerId, property, value);
      return;
    }
    const layer = map.layerManager.searchByLayerId(layerId);
    if (layer?.layerRenderInfo) {
      layer.layerRenderInfo[property] = value;
    }
  }

  function syncUiDom(ui: ResolvedUiState): void {
    const parent = map.canvas.parentElement;
    if (!parent) return;

    const submenu = parent.querySelector('#autkMapSubMenu') as HTMLElement | null;
    if (submenu) submenu.style.visibility = ui.mapMenuOpen ? 'visible' : 'hidden';

    const thematicCheckbox = parent.querySelector('#showThematicCheckbox') as HTMLInputElement | null;
    if (thematicCheckbox) thematicCheckbox.checked = ui.thematicEnabled;

    const legend = parent.querySelector('#autkMapLegend') as HTMLElement | null;
    if (legend) legend.style.visibility = ui.thematicEnabled ? 'visible' : 'hidden';

    const visibleSet = new Set(ui.visibleLayerIds);
    const visibleCheckboxes = parent.querySelectorAll(
      '#visibleLayerDropdownList input[type="checkbox"]'
    ) as NodeListOf<HTMLInputElement>;
    visibleCheckboxes.forEach((checkbox) => {
      checkbox.checked = visibleSet.has(checkbox.value);
    });

    const activeRadios = parent.querySelectorAll('.active-layer-radio') as NodeListOf<HTMLInputElement>;
    activeRadios.forEach((radio) => {
      radio.checked = !!ui.activeLayerId && radio.value === ui.activeLayerId;
    });
  }

  function inMapContainer(target: EventTarget | null): boolean {
    if (!isElement(target)) return false;
    const parent = map.canvas.parentElement;
    return !!parent && parent.contains(target);
  }

  function buildUiDelta(overrides: Partial<NonNullable<AutarkProvenanceState['ui']>> = {}): Partial<AutarkProvenanceState> {
    return {
      ui: {
        mapMenuOpen: getMenuOpen(),
        activeLayerId: getActiveLayerId(),
        visibleLayerIds: getVisibleLayerIds(),
        thematicEnabled: getThematicEnabled(),
        ...overrides,
      },
    };
  }

  function recordUiEvent(
    actionType: ProvenanceAction,
    actionLabel: string,
    overrides: Partial<NonNullable<AutarkProvenanceState['ui']>> = {}
  ): void {
    onRecord(actionType, actionLabel, buildUiDelta(overrides));
  }

  function wrapMapMethod(
    methodName: string,
    onAfter: (args: unknown[]) => void
  ): void {
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
      onRecord(ProvenanceAction.MAP_INIT, 'Map initialized', buildUiDelta());
    });
    wrapMapMethod('loadGeoJsonLayer', (args) => {
      const [layerName] = args;
      const name = typeof layerName === 'string' ? layerName : 'layer';
      onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Map layer loaded: ${name}`, buildUiDelta());
    });
    wrapMapMethod('loadGeoTiffLayer', (args) => {
      const [layerName] = args;
      const name = typeof layerName === 'string' ? layerName : 'raster';
      onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Raster layer loaded: ${name}`, buildUiDelta());
    });

    pickListener = (selection: number[], layerId: string) => {
      const label =
        selection.length === 0
          ? `Cleared selection on ${layerId}`
          : `Picked ${selection.length} feature(s) on ${layerId}`;
      onRecord(ProvenanceAction.MAP_PICK, label, {
        selection: {
          map: { layerId, ids: selection },
          plot: selection,
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

    if (typeof document !== 'undefined') {
      clickListener = (event: Event) => {
        if (isApplyingState || !inMapContainer(event.target)) return;
        const target = event.target;
        if (!isElement(target)) return;

        if (target.closest('#menuIcon')) {
          recordUiEvent(
            ProvenanceAction.MAP_UI_MENU_TOGGLE,
            getMenuOpen() ? 'Opened map menu' : 'Closed map menu',
            { mapMenuOpen: getMenuOpen() }
          );
        }
      };
      document.addEventListener('click', clickListener);

      changeListener = (event: Event) => {
        if (isApplyingState || !inMapContainer(event.target)) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;

        if (target.id === 'showThematicCheckbox') {
          recordUiEvent(
            ProvenanceAction.MAP_UI_THEMATIC_TOGGLE,
            target.checked ? 'Enabled thematic legend' : 'Disabled thematic legend',
            { thematicEnabled: target.checked }
          );
          return;
        }

        if (target.classList.contains('active-layer-radio')) {
          const activeLayerId = getActiveLayerId() ?? target.value;
          recordUiEvent(
            ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE,
            `Active layer: ${activeLayerId}`,
            { activeLayerId }
          );
          return;
        }

        if (target.type === 'checkbox' && target.closest('#visibleLayerDropdownList')) {
          const layerId = target.value || 'layer';
          recordUiEvent(
            ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE,
            target.checked ? `Show layer: ${layerId}` : `Hide layer: ${layerId}`,
            { visibleLayerIds: getVisibleLayerIds() }
          );
        }
      };
      document.addEventListener('change', changeListener);
    }
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
      const { selection } = state;
      const ui = resolveUiState(state.ui);

      const visibleLayerIds = new Set(ui.visibleLayerIds);
      for (const layer of getAllLayers()) {
        const layerId = layer.layerInfo?.id;
        if (!layerId) continue;
        setLayerRenderFlag(layerId, 'isSkip', !visibleLayerIds.has(layerId));
      }

      const parent = map.canvas.parentElement;
      const thematicCheckbox = parent?.querySelector('#showThematicCheckbox') as HTMLInputElement | null;
      if (thematicCheckbox) thematicCheckbox.checked = ui.thematicEnabled;

      if (ui.activeLayerId) {
        const activeLayer = map.layerManager.searchByLayerId(ui.activeLayerId);
        if (activeLayer && map.ui?.changeActiveLayer) {
          map.ui.changeActiveLayer(activeLayer);
        }
      }

      for (const layer of getAllLayers()) {
        const layerId = layer.layerInfo?.id;
        if (!layerId) continue;
        const shouldUseThematic = ui.thematicEnabled && !!ui.activeLayerId && layerId === ui.activeLayerId;
        setLayerRenderFlag(layerId, 'isColorMap', shouldUseThematic);
      }

      syncUiDom(ui);

      if (state.view && map.setViewState) {
        map.setViewState(state.view);
      }

      if (selection) {
        const targetLayerId = selection.map?.layerId;
        const targetIds = selection.map?.ids ?? [];
        const fallbackPlotIds = selection.plot ?? [];
        const fallbackLayerId = ui.activeLayerId;

        for (const layer of map.layerManager.vectorLayers ?? []) {
          const layerId = layer.layerInfo?.id;
          if (!layerId) continue;
          const isMapTarget = !!targetLayerId && layerId === targetLayerId;
          const isPlotTarget = !targetLayerId && !!fallbackLayerId && layerId === fallbackLayerId;
          if (isMapTarget && targetIds.length > 0) {
            layer.setHighlightedIds?.(targetIds);
          } else if (isPlotTarget && fallbackPlotIds.length > 0) {
            layer.setHighlightedIds?.(fallbackPlotIds);
          } else {
            layer.clearHighlightedIds?.();
          }
        }
      }
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
