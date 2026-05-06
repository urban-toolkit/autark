import type { AutarkProvenanceState, IMapForProvenance } from '../../types';
import { ProvenanceAction } from '../../types';
import type { CustomControlConfig, MapRecordCallback } from './types';
import { arraysEqual } from './recording-shared';
import { getActiveLayerId, getLayerIds, getThematicEnabled, getVisibleLayerIds } from './utils';

export function createControlRecorder(options: {
  map: IMapForProvenance;
  customControls: CustomControlConfig[];
  onRecord: MapRecordCallback;
  getCurrentState: () => AutarkProvenanceState;
  buildUiDelta: (overrides?: Partial<NonNullable<AutarkProvenanceState['ui']>>) => Partial<AutarkProvenanceState>;
}) {
  const { map, customControls, onRecord, getCurrentState, buildUiDelta } = options;

  return {
    recordCustomControl(target: Element, eventType: 'click' | 'change'): boolean {
      for (const control of customControls) {
        if (control.event !== eventType) continue;
        const match = target.matches(control.selector) ? target : target.closest(control.selector);
        if (!match) continue;
        onRecord(control.actionType, control.getLabel(match), control.getStateDelta(match));
        return true;
      }
      return false;
    },

    recordLayerControl(target: Element): boolean {
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
    },

    recordThematicCheckbox(target: HTMLInputElement): void {
      onRecord(
        ProvenanceAction.MAP_UI_THEMATIC_TOGGLE,
        target.checked ? 'Enabled thematic legend' : 'Disabled thematic legend',
        buildUiDelta({ thematicEnabled: target.checked }),
      );
    },

    recordActiveLayerRadio(target: HTMLInputElement): void {
      onRecord(
        ProvenanceAction.MAP_UI_ACTIVE_LAYER_CHANGE,
        `Active layer: ${getActiveLayerId(map) ?? target.value}`,
        buildUiDelta({ activeLayerId: getActiveLayerId(map) ?? target.value }),
      );
    },

    recordVisibleLayerCheckbox(target: HTMLInputElement): void {
      onRecord(
        ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE,
        target.checked ? `Show layer: ${target.value || 'layer'}` : `Hide layer: ${target.value || 'layer'}`,
        buildUiDelta({ visibleLayerIds: getVisibleLayerIds(map) }),
      );
    },

    recordUpdateRenderInfo(layerId: unknown, params: unknown): boolean {
      const info = params && typeof params === 'object' && 'renderInfo' in (params as Record<string, unknown>)
        ? (params as { renderInfo?: Record<string, unknown> }).renderInfo ?? {}
        : (params as Record<string, unknown> | undefined) ?? {};
      const resolvedLayerId = typeof layerId === 'string' ? layerId : 'layer';

      if ('isSkip' in info) {
        const nextVisibleLayerIds = getVisibleLayerIds(map);
        const previousVisibleLayerIds = getCurrentState().ui?.visibleLayerIds ?? getLayerIds(map);
        if (arraysEqual(previousVisibleLayerIds, nextVisibleLayerIds)) return true;
        onRecord(
          ProvenanceAction.MAP_UI_VISIBLE_LAYER_TOGGLE,
          nextVisibleLayerIds.includes(resolvedLayerId) ? `Show layer: ${resolvedLayerId}` : `Hide layer: ${resolvedLayerId}`,
          buildUiDelta({ visibleLayerIds: nextVisibleLayerIds }),
        );
        return true;
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
            buildUiDelta({ activeLayerId: nextActiveLayerId, thematicEnabled: nextThematicEnabled }),
          );
        }
      }

      return true;
    },
  };
}
