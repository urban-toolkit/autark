import type { AutarkProvenanceState, IMapForProvenance } from '../../types';
import type { CustomControlConfig, ResolvedMapSelectors } from './types';
import { syncCustomControlsDom, syncUiDom } from './dom';
import { getAllLayers, resolveUiState, setLayerRenderFlag } from './utils';

export function applyMapState(options: {
  map: IMapForProvenance;
  selectors: ResolvedMapSelectors;
  customControls: CustomControlConfig[];
  state: AutarkProvenanceState;
  setApplyingState: (value: boolean) => void;
}): void {
  const { map, selectors, customControls, state, setApplyingState } = options;
  setApplyingState(true);

  try {
    const ui = resolveUiState(map, state.ui);
    const visibleLayerIds = new Set(ui.visibleLayerIds);

    getAllLayers(map).forEach((layer) => {
      const layerId = layer.layerInfo?.id;
      if (layerId) setLayerRenderFlag(map, layerId, 'isSkip', !visibleLayerIds.has(layerId));
    });

    if (ui.activeLayerId) {
      const activeLayer = map.layerManager.searchByLayerId(ui.activeLayerId);
      if (activeLayer && map.ui?.changeActiveLayer) map.ui.changeActiveLayer(activeLayer);
    }

    getAllLayers(map).forEach((layer) => {
      const layerId = layer.layerInfo?.id;
      if (!layerId) return;
      setLayerRenderFlag(map, layerId, 'isColorMap', ui.thematicEnabled && layerId === ui.activeLayerId);
    });

    syncUiDom(map, selectors, ui);
    syncCustomControlsDom(map, customControls, state);
    if (state.view && map.setViewState) map.setViewState(state.view);

    const targetLayerId = state.selection.map?.layerId;
    const targetIds = state.selection.map?.ids ?? [];
    const fallbackLayerId = ui.activeLayerId;
    const fallbackPlotIds = [...new Set(Object.values(state.selection.plots ?? {}).flatMap((plot) => plot.ids))];

    (map.layerManager.vectorLayers ?? []).forEach((layer) => {
      const layerId = layer.layerInfo?.id;
      if (!layerId) return;
      const combinedIds = new Set<number>();
      if (targetLayerId === layerId) targetIds.forEach((id) => combinedIds.add(id));
      if (fallbackLayerId === layerId) fallbackPlotIds.forEach((id) => combinedIds.add(id));
      combinedIds.size > 0 ? layer.setHighlightedIds?.([...combinedIds]) : layer.clearHighlightedIds?.();
    });
  } finally {
    setApplyingState(false);
  }
}
