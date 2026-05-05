import type { AutarkProvenanceState, IMapForProvenance, MapViewState } from '../../types';
import { ProvenanceAction } from '../../types';
import { isTargetInMapContainer } from './dom';
import type { CustomControlConfig, MapRecordCallback, ResolvedMapSelectors } from './types';
import { getActiveLayerId, getMenuOpen, getVisibleLayerIds, isElement } from './utils';

const MAP_PICK_EVENT = 'pick';

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
  const wrappedMethods = new Map<string, unknown>();
  const cleanups: Array<() => void> = [];

  function wrapMapMethod(methodName: string, onAfter: (args: unknown[]) => void): void {
    const current = mapObj[methodName];
    if (typeof current !== 'function' || wrappedMethods.has(methodName)) return;
    wrappedMethods.set(methodName, current);
    mapObj[methodName] = function (...args: unknown[]) {
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

      const pickListener = (selection: number[], layerId: string) => {
        const activePlotIds = new Set(Object.values(getCurrentState().selection.plots ?? {}).flatMap((plot) => plot.ids));
        const mapOwnedSelection = selection.filter((id) => !activePlotIds.has(id));
        const label = mapOwnedSelection.length === 0 ? `Cleared selection on ${layerId}` : `Picked ${mapOwnedSelection.length} feature(s) on ${layerId}`;
        onRecord(ProvenanceAction.MAP_PICK, label, { selection: { map: { layerId, ids: mapOwnedSelection }, plots: {} } });
      };
      map.mapEvents.addEventListener(MAP_PICK_EVENT, pickListener);
      cleanups.push(() => map.mapEvents.removeEventListener?.(MAP_PICK_EVENT, pickListener));

      if (map.addViewListener) {
        const viewListener = (viewState: MapViewState) => {
          if (!isApplyingState()) onRecord(ProvenanceAction.MAP_VIEW, `View changed (alt: ${viewState.eye[2].toFixed(0)})`, { view: viewState });
        };
        map.addViewListener(viewListener);
        cleanups.push(() => map.removeViewListener?.(viewListener));
      }

      if (typeof document === 'undefined') return;
      const clickListener = (event: Event) => {
        const target = event.target;
        if (isApplyingState() || !isElement(target)) return;
        if (recordCustomControl(target, 'click')) return;
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
      cleanups.splice(0).forEach((cleanup) => cleanup());
      wrappedMethods.forEach((original, methodName) => {
        mapObj[methodName] = original;
      });
      wrappedMethods.clear();
    },
  };
}
