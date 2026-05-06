import type { AutarkProvenanceState, IMapForProvenance, MapViewState } from '../../types';
import { ProvenanceAction } from '../../types';
import { isTargetInMapContainer } from './dom';
import type { CustomControlConfig, MapRecordCallback, ResolvedMapSelectors } from './types';
import { getActiveLayerId, getLayerIds, getMenuOpen, getThematicEnabled, getVisibleLayerIds, isElement } from './utils';

const MAP_PICK_EVENT = 'picking';
const MAP_VIEW_DEBOUNCE_MS = 180;

function selectionSignature(selection: number[]): string {
  return selection.join(',');
}

function viewsEqual(a: MapViewState | undefined, b: MapViewState | undefined, epsilon = 1e-6): boolean {
  if (!a || !b) return a === b;
  return vectorsEqual(a.eye, b.eye, epsilon)
    && vectorsEqual(a.lookAt, b.lookAt, epsilon)
    && vectorsEqual(a.up, b.up, epsilon);
}

function vectorsEqual(a: number[], b: number[], epsilon: number): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function createMapRecordingController(options: {
  map: IMapForProvenance;
  selectors: ResolvedMapSelectors;
  customControls: CustomControlConfig[];
  onRecord: MapRecordCallback;
  getCurrentState: () => AutarkProvenanceState;
  isApplyingState: () => boolean;
  buildUiDelta: (overrides?: Partial<NonNullable<AutarkProvenanceState['ui']>>) => Partial<AutarkProvenanceState>;
}): { start(): void; stop(): void } {
  const { map, selectors, customControls, onRecord, getCurrentState, isApplyingState, buildUiDelta } = options;
  const mapObj = map as unknown as Record<string, unknown>;
  const mapUiObj = (map.ui ?? {}) as Record<string, unknown>;
  const wrappedMethods = new Map<string, unknown>();
  const cleanups: Array<() => void> = [];
  let pendingViewState: MapViewState | null = null;
  let viewTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingViewState(): void {
    if (!pendingViewState || isApplyingState()) return;
    const nextViewState = pendingViewState;
    pendingViewState = null;
    const currentViewState = getCurrentState().view;
    if (viewsEqual(currentViewState, nextViewState)) return;
    onRecord(ProvenanceAction.MAP_VIEW, `View changed (alt: ${nextViewState.eye[2].toFixed(0)})`, { view: nextViewState });
  }

  function scheduleViewRecord(viewState: MapViewState): void {
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
  }

  function wrapMapMethod(methodName: string, onAfter: (args: unknown[]) => void): void {
    wrapMethod(mapObj, methodName, onAfter);
  }

  function wrapUiMethod(methodName: string, onAfter: (args: unknown[]) => void): void {
    wrapMethod(mapUiObj, methodName, onAfter);
  }

  function wrapMethod(target: Record<string, unknown>, methodName: string, onAfter: (args: unknown[]) => void): void {
    const current = target[methodName];
    if (typeof current !== 'function' || wrappedMethods.has(methodName)) return;
    wrappedMethods.set(methodName, current);
    target[methodName] = function (...args: unknown[]) {
      const result = (current as (...values: unknown[]) => unknown).apply(this, args);
      if (!isApplyingState()) onAfter(args);
      return result;
    };
  }

  function recordCustomControl(target: Element, eventType: 'click' | 'change'): boolean {
    for (const control of customControls) {
      if (control.event !== eventType) continue;
      const match = target.matches(control.selector) ? target : target.closest(control.selector);
      if (match) {
        onRecord(control.actionType, control.getLabel(match), control.getStateDelta(match));
        return true;
      }
    }
    return false;
  }

  function recordLayerControl(target: Element): boolean {
    const button = target.closest('[data-autk-map-control]') as HTMLElement | null;
    if (!button) return false;

    const control = button.dataset.autkMapControl;
    const layerId = button.dataset.layerId;
    if (!control || !layerId) return false;

    const currentUi = getCurrentState().ui;
    const layer = map.layerManager.searchByLayerId(layerId);

    if (control === 'visibility') {
      const nextVisibleLayerIds = getVisibleLayerIds(map);
      const previousVisibleLayerIds = currentUi?.visibleLayerIds ?? getLayerIds(map);
      if (arraysEqual(previousVisibleLayerIds, nextVisibleLayerIds)) return true;
      onRecord(
        ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE,
        nextVisibleLayerIds.includes(layerId) ? `Show layer: ${layerId}` : `Hide layer: ${layerId}`,
        buildUiDelta({ visibleLayerIds: nextVisibleLayerIds }),
      );
      return true;
    }

    if (control === 'thematic') {
      // Read thematic state directly from the clicked layer — getThematicEnabled() reads from
      // map.ui.activeLayer which may be null, causing changes on non-active layers to be missed.
      const nowThematic = !!layer?.layerRenderInfo?.isColorMap;
      const prevThematic = currentUi?.thematicEnabled ?? false;
      if (prevThematic === nowThematic) return true;
      onRecord(
        ProvenanceAction.MAP_UI_THEMATIC_TOGGLE,
        nowThematic ? `Enable thematic: ${layerId}` : `Disable thematic: ${layerId}`,
        buildUiDelta({ thematicEnabled: nowThematic, activeLayerId: layerId }),
      );
      return true;
    }

    if (control === 'active-layer') {
      const nextActiveLayerId = getActiveLayerId(map);
      // Compare stored previous id against the new id (not the fallback-to-new pattern)
      const previousActiveLayerId = currentUi?.activeLayerId ?? null;
      if (previousActiveLayerId === nextActiveLayerId) return true;
      onRecord(
        ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE,
        `Active layer: ${nextActiveLayerId ?? layerId}`,
        buildUiDelta({ activeLayerId: nextActiveLayerId, thematicEnabled: !!layer?.layerRenderInfo?.isColorMap }),
      );
      return true;
    }

    return false;
  }

  return {
    start: () => {
      if (cleanups.length > 0) return;
      wrapMapMethod('init', () => onRecord(ProvenanceAction.MAP_INIT, 'Map initialized', buildUiDelta()));
      wrapMapMethod('loadGeoJsonLayer', ([layerName]) => {
        onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Map layer loaded: ${typeof layerName === 'string' ? layerName : 'layer'}`, buildUiDelta());
      });
      wrapMapMethod('loadGeoTiffLayer', ([layerName]) => {
        onRecord(ProvenanceAction.MAP_LAYER_LOAD, `Raster layer loaded: ${typeof layerName === 'string' ? layerName : 'raster'}`, buildUiDelta());
      });
      wrapMapMethod('updateRenderInfo', ([layerId, params]) => {
        const info = params && typeof params === 'object' && 'renderInfo' in (params as Record<string, unknown>)
          ? (params as { renderInfo?: Record<string, unknown> }).renderInfo ?? {}
          : (params as Record<string, unknown> | undefined) ?? {};
        const resolvedLayerId = typeof layerId === 'string' ? layerId : 'layer';

        if ('isSkip' in info) {
          const nextVisibleLayerIds = getVisibleLayerIds(map);
          const previousVisibleLayerIds = getCurrentState().ui?.visibleLayerIds ?? getLayerIds(map);
          if (!arraysEqual(previousVisibleLayerIds, nextVisibleLayerIds)) {
            onRecord(
              ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE,
              nextVisibleLayerIds.includes(resolvedLayerId) ? `Show layer: ${resolvedLayerId}` : `Hide layer: ${resolvedLayerId}`,
              buildUiDelta({ visibleLayerIds: nextVisibleLayerIds })
            );
            return;
          }
        }

        if ('isColorMap' in info) {
          const nextActiveLayerId = getActiveLayerId(map);
          const nextThematicEnabled = getThematicEnabled(map);
          const previousUi = getCurrentState().ui;
          if (
            (previousUi?.activeLayerId ?? nextActiveLayerId) !== nextActiveLayerId
            || (previousUi?.thematicEnabled ?? nextThematicEnabled) !== nextThematicEnabled
          ) {
            onRecord(
              ProvenanceAction.MAP_UI_THEMATIC_TOGGLE,
              nextThematicEnabled ? `Enable thematic: ${nextActiveLayerId ?? resolvedLayerId}` : `Disable thematic: ${resolvedLayerId}`,
              buildUiDelta({ activeLayerId: nextActiveLayerId, thematicEnabled: nextThematicEnabled })
            );
          }
        }
      });
      wrapUiMethod('changeActiveLayer', () => {
        const nextActiveLayerId = getActiveLayerId(map);
        const nextThematicEnabled = getThematicEnabled(map);
        if ((getCurrentState().ui?.activeLayerId ?? nextActiveLayerId) === nextActiveLayerId) return;
        onRecord(
          ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE,
          `Active layer: ${nextActiveLayerId ?? 'layer'}`,
          buildUiDelta({ activeLayerId: nextActiveLayerId, thematicEnabled: nextThematicEnabled })
        );
      });

      const pickListener = (selection: number[], layerId: string) => {
        const activePlotIds = new Set(Object.values(getCurrentState().selection.plots ?? {}).flatMap((plot) => plot.ids));
        const mapOwnedSelection = selection.filter((id) => !activePlotIds.has(id));
        const previousMapSelection = getCurrentState().selection.map?.ids ?? [];
        const previousLayerId = getCurrentState().selection.map?.layerId ?? null;
        if (
          selectionSignature(mapOwnedSelection) === selectionSignature(previousMapSelection) &&
          (mapOwnedSelection.length > 0 ? previousLayerId === layerId : previousMapSelection.length === 0)
        ) {
          return;
        }
        const label = mapOwnedSelection.length === 0 ? `Cleared selection on ${layerId}` : `Picked ${mapOwnedSelection.length} feature(s) on ${layerId}`;
        onRecord(ProvenanceAction.MAP_PICK, label, { selection: { map: { layerId, ids: mapOwnedSelection }, plots: {} } });
      };
      map.mapEvents.addEventListener(MAP_PICK_EVENT, pickListener);
      cleanups.push(() => map.mapEvents.removeEventListener?.(MAP_PICK_EVENT, pickListener));

      if (map.addViewListener) {
        const viewListener = (viewState: MapViewState) => {
          if (!isApplyingState()) scheduleViewRecord(viewState);
        };
        map.addViewListener(viewListener);
        cleanups.push(() => map.removeViewListener?.(viewListener));
      }

      if (typeof document === 'undefined') return;
      const clickListener = (event: Event) => {
        const target = event.target;
        if (isApplyingState() || !isElement(target)) return;
        if (recordCustomControl(target, 'click')) return;
        // recordLayerControl must run before isTargetInMapContainer: the map UI's
        // onClick handler calls updateRenderInfo which triggers refreshLayerList(),
        // removing the original button from the DOM before this listener fires.
        // Element.closest() still works on detached nodes via the element's own
        // ancestor chain, but parentElement.contains() returns false for detached nodes.
        if (recordLayerControl(target)) return;
        if (!isTargetInMapContainer(map, target)) return;
        if (target.closest(selectors.menuIcon)) {
          const mapMenuOpen = getMenuOpen(map, selectors);
          onRecord(ProvenanceAction.MAP_UI_MENU_TOGGLE, mapMenuOpen ? 'Opened map menu' : 'Closed map menu', buildUiDelta({ mapMenuOpen }));
        }
      };
      const changeListener = (event: Event) => {
        const target = event.target;
        if (isApplyingState() || !isElement(target)) return;
        if (recordCustomControl(target, 'change')) return;
        if (!isTargetInMapContainer(map, target) || !(target instanceof HTMLInputElement)) return;
        if (target.id === selectors.thematicCheckbox.replace(/^#/, '')) {
          onRecord(ProvenanceAction.MAP_UI_THEMATIC_TOGGLE, target.checked ? 'Enabled thematic legend' : 'Disabled thematic legend', buildUiDelta({ thematicEnabled: target.checked }));
        } else if (target.classList.contains(selectors.activeLayerRadioClass.replace(/^\./, ''))) {
          onRecord(ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE, `Active layer: ${getActiveLayerId(map) ?? target.value}`, buildUiDelta({ activeLayerId: getActiveLayerId(map) ?? target.value }));
        } else if (target.type === 'checkbox' && target.closest(`#${selectors.visibleLayerList.replace(/^#/, '')}`)) {
          onRecord(ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE, target.checked ? `Show layer: ${target.value || 'layer'}` : `Hide layer: ${target.value || 'layer'}`, buildUiDelta({ visibleLayerIds: getVisibleLayerIds(map) }));
        }
      };
      document.addEventListener('click', clickListener);
      document.addEventListener('change', changeListener);
      cleanups.push(() => document.removeEventListener('click', clickListener));
      cleanups.push(() => document.removeEventListener('change', changeListener));
    },
    stop: () => {
      if (viewTimer) {
        clearTimeout(viewTimer);
        viewTimer = null;
      }
      pendingViewState = null;
      cleanups.splice(0).forEach((cleanup) => cleanup());
      wrappedMethods.forEach((original, methodName) => {
        if (mapObj[methodName] !== undefined) {
          mapObj[methodName] = original;
        } else if (mapUiObj[methodName] !== undefined) {
          mapUiObj[methodName] = original;
        }
      });
      wrappedMethods.clear();
    },
  };
}
