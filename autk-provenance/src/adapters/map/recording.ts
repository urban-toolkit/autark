import type { AutarkProvenanceState, IMapForProvenance, MapViewState } from '../../types';
import { ProvenanceAction } from '../../types';
import { isTargetInMapContainer } from './dom';
import { createControlRecorder } from './recording-controls';
import { selectionSignature } from './recording-shared';
import { createViewRecorder } from './recording-view';
import type { CustomControlConfig, MapRecordCallback, ResolvedMapSelectors } from './types';
import { getActiveLayerId, getMenuOpen, getThematicEnabled, isElement } from './utils';

const MAP_PICK_EVENT = 'picking';

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
  const controls = createControlRecorder({ map, customControls, onRecord, getCurrentState, buildUiDelta });
  const viewRecorder = createViewRecorder(onRecord, getCurrentState, isApplyingState);

  const wrapMapMethod = (methodName: string, onAfter: (args: unknown[]) => void) => {
    wrapMethod(mapObj, methodName, onAfter);
  };
  const wrapUiMethod = (methodName: string, onAfter: (args: unknown[]) => void) => {
    wrapMethod(mapUiObj, methodName, onAfter);
  };

  const wrapMethod = (target: Record<string, unknown>, methodName: string, onAfter: (args: unknown[]) => void) => {
    const current = target[methodName];
    if (typeof current !== 'function' || wrappedMethods.has(methodName)) return;
    wrappedMethods.set(methodName, current);
    target[methodName] = function (...args: unknown[]) {
      const result = (current as (...values: unknown[]) => unknown).apply(this, args);
      if (!isApplyingState()) onAfter(args);
      return result;
    };
  };

  const attachPickListener = () => {
    const pickListener = (selection: number[], layerId: string) => {
      const currentState = getCurrentState();
      const normalizedSelection = [...new Set(selection)].sort((a, b) => a - b);
      const previousMapSelection = currentState.selection.map?.ids ?? [];
      const previousLayerId = getCurrentState().selection.map?.layerId ?? null;
      const previousPlots = currentState.selection.plots ?? {};
      const previousCombined = new Set<number>([
        ...previousMapSelection,
        ...Object.values(previousPlots).flatMap((plot) => plot.ids),
      ]);
      const nextCombined = new Set<number>(normalizedSelection);
      const removedIds = [...previousCombined].filter((id) => !nextCombined.has(id));
      const removedIdSet = new Set(removedIds);
      const nextPlots = Object.fromEntries(
        Object.entries(previousPlots).map(([plotId, plotState]) => [
          plotId,
          removedIdSet.size > 0
            ? { ...plotState, ids: plotState.ids.filter((id) => !removedIdSet.has(id)) }
            : plotState,
        ]),
      );
      const coordinatedPlotIds = new Set(Object.values(nextPlots).flatMap((plot) => plot.ids));
      const nextMapOwnedSelection = normalizedSelection.filter((id) => !coordinatedPlotIds.has(id));

      if (
        selectionSignature(nextMapOwnedSelection) === selectionSignature(previousMapSelection) &&
        JSON.stringify(nextPlots) === JSON.stringify(previousPlots) &&
        (nextMapOwnedSelection.length > 0 ? previousLayerId === layerId : previousMapSelection.length === 0)
      ) {
        return;
      }
      const label = normalizedSelection.length === 0 ? `Cleared selection on ${layerId}` : `Picked ${normalizedSelection.length} feature(s) on ${layerId}`;
      onRecord(ProvenanceAction.MAP_PICK, label, {
        selection: {
          map: nextMapOwnedSelection.length > 0 ? { layerId, ids: nextMapOwnedSelection } : null,
          plots: nextPlots,
        },
      });
    };
    map.mapEvents.addEventListener(MAP_PICK_EVENT, pickListener);
    cleanups.push(() => map.mapEvents.removeEventListener?.(MAP_PICK_EVENT, pickListener));
  };

  const attachViewListener = () => {
    if (!map.addViewListener) return;
    const viewListener = (viewState: MapViewState) => {
      if (!isApplyingState()) viewRecorder.schedule(viewState);
    };
    map.addViewListener(viewListener);
    cleanups.push(() => map.removeViewListener?.(viewListener));
  };

  const attachDocumentListeners = () => {
    if (typeof document === 'undefined') return;
    const clickListener = (event: Event) => {
      const target = event.target;
      if (isApplyingState() || !isElement(target)) return;
      if (controls.recordCustomControl(target, 'click')) return;
      if (controls.recordLayerControl(target)) return;
      if (!isTargetInMapContainer(map, target)) return;
      if (target.closest(selectors.menuIcon)) {
        const mapMenuOpen = getMenuOpen(map, selectors);
        onRecord(ProvenanceAction.MAP_UI_MENU_TOGGLE, mapMenuOpen ? 'Opened map menu' : 'Closed map menu', buildUiDelta({ mapMenuOpen }));
      }
    };
    const changeListener = (event: Event) => {
      const target = event.target;
      if (isApplyingState() || !isElement(target)) return;
      if (controls.recordCustomControl(target, 'change')) return;
      if (!isTargetInMapContainer(map, target) || !(target instanceof HTMLInputElement)) return;
      if (target.id === selectors.thematicCheckbox.replace(/^#/, '')) {
        controls.recordThematicCheckbox(target);
      } else if (target.classList.contains(selectors.activeLayerRadioClass.replace(/^\./, ''))) {
        controls.recordActiveLayerRadio(target);
      } else if (target.type === 'checkbox' && target.closest(`#${selectors.visibleLayerList.replace(/^#/, '')}`)) {
        controls.recordVisibleLayerCheckbox(target);
      }
    };
    document.addEventListener('click', clickListener);
    document.addEventListener('change', changeListener);
    cleanups.push(() => document.removeEventListener('click', clickListener));
    cleanups.push(() => document.removeEventListener('change', changeListener));
  };

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
        controls.recordUpdateRenderInfo(layerId, params);
      });
      wrapUiMethod('changeActiveLayer', () => {
        const nextActiveLayerId = getActiveLayerId(map);
        const nextThematicEnabled = getThematicEnabled(map);
        if ((getCurrentState().ui?.activeLayerId ?? nextActiveLayerId) === nextActiveLayerId) return;
        onRecord(
          ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE,
          `Active layer: ${nextActiveLayerId ?? 'layer'}`,
          buildUiDelta({ activeLayerId: nextActiveLayerId, thematicEnabled: nextThematicEnabled }),
        );
      });

      attachPickListener();
      attachViewListener();
      attachDocumentListeners();
    },
    stop: () => {
      viewRecorder.stop();
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
