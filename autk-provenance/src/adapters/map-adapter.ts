import type { AutarkProvenanceState, IMapForProvenance } from '../types';
import { ProvenanceAction } from '../types';

const MAP_PICK_EVENT = 'pick';

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

export function createMapAdapter(
  map: IMapForProvenance,
  onRecord: MapRecordCallback
): MapAdapterApi {
  let pickListener: ((selection: number[], layerId: string) => void) | null = null;

  function startRecording(): void {
    if (pickListener) return;
    pickListener = (selection: number[], layerId: string) => {
      const label =
        selection.length === 0
          ? `Cleared selection on ${layerId}`
          : `Picked ${selection.length} feature(s) on ${layerId}`;
      onRecord(ProvenanceAction.MAP_PICK, label, {
        selection: {
          map: { layerId, ids: selection },
        },
      } as Partial<AutarkProvenanceState>);
    };
    map.mapEvents.addEventListener(MAP_PICK_EVENT, pickListener);
  }

  function stopRecording(): void {
    if (pickListener && map.mapEvents.removeEventListener) {
      map.mapEvents.removeEventListener(MAP_PICK_EVENT, pickListener);
      pickListener = null;
    }
  }

  function applyState(state: AutarkProvenanceState): void {
    const { selection } = state;
    if (!selection) return;

    const layers = map.layerManager.vectorLayers;
    if (layers) {
      for (const layer of layers) {
        const id = layer.layerInfo?.id;
        if (id === selection.map?.layerId) {
          if (selection.map && selection.map.ids.length > 0) {
            layer.setHighlightedIds(selection.map.ids);
          } else {
            layer.clearHighlightedIds();
          }
        } else {
          layer.clearHighlightedIds();
        }
      }
    } else {
      const layerId = selection.map?.layerId;
      if (layerId) {
        const layer = map.layerManager.searchByLayerId(layerId);
        if (layer) {
          if (selection.map && selection.map.ids.length > 0) {
            layer.setHighlightedIds(selection.map.ids);
          } else {
            layer.clearHighlightedIds();
          }
        }
      }
    }
  }

  return {
    startRecording,
    stopRecording,
    applyState,
  };
}
