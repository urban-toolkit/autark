import type { AutarkProvenanceState, IMapForProvenance } from '../types';
import type { ResolvedMapSelectors } from './map-adapter-shared';
import type { createMapUiHelpers } from './map-ui-helpers';

type MapUiHelpers = ReturnType<typeof createMapUiHelpers>;

export function applyMapProvenanceState(
  map: IMapForProvenance,
  ui: MapUiHelpers,
  selectors: ResolvedMapSelectors,
  state: AutarkProvenanceState
): void {
  const { selection } = state;
  const resolvedUi = ui.resolveUiState(state.ui);

  const visibleLayerIds = new Set(resolvedUi.visibleLayerIds);
  for (const layer of ui.getAllLayers()) {
    const layerId = layer.layerInfo?.id;
    if (!layerId) continue;
    ui.setLayerRenderFlag(layerId, 'isSkip', !visibleLayerIds.has(layerId));
  }

  const parent = map.canvas.parentElement;
  const thematicCheckbox = parent?.querySelector(selectors.thematicCheckbox) as HTMLInputElement | null;
  if (thematicCheckbox) thematicCheckbox.checked = resolvedUi.thematicEnabled;

  if (resolvedUi.activeLayerId) {
    const activeLayer = map.layerManager.searchByLayerId(resolvedUi.activeLayerId);
    if (activeLayer && map.ui?.changeActiveLayer) {
      map.ui.changeActiveLayer(activeLayer);
    }
  }

  for (const layer of ui.getAllLayers()) {
    const layerId = layer.layerInfo?.id;
    if (!layerId) continue;
    const shouldUseThematic =
      resolvedUi.thematicEnabled && !!resolvedUi.activeLayerId && layerId === resolvedUi.activeLayerId;
    ui.setLayerRenderFlag(layerId, 'isColorMap', shouldUseThematic);
  }

  ui.syncUiDom(resolvedUi);
  ui.syncCustomControlsDom(state);

  if (state.view && map.setViewState) {
    map.setViewState(state.view);
  }

  if (!selection) return;

  const targetLayerId = selection.map?.layerId;
  const targetIds = selection.map?.ids ?? [];
  const allPlotIds = Object.values(selection.plots ?? {}).flatMap((plotState) => plotState.ids);
  const fallbackPlotIds = [...new Set(allPlotIds)];
  const fallbackLayerId = resolvedUi.activeLayerId;

  for (const layer of map.layerManager.vectorLayers ?? []) {
    const layerId = layer.layerInfo?.id;
    if (!layerId) continue;
    const combinedIds = new Set<number>();
    if (targetLayerId && layerId === targetLayerId) {
      targetIds.forEach((id) => combinedIds.add(id));
    }
    if (fallbackLayerId && layerId === fallbackLayerId) {
      fallbackPlotIds.forEach((id) => combinedIds.add(id));
    }

    if (combinedIds.size > 0) {
      layer.setHighlightedIds?.([...combinedIds]);
    } else {
      layer.clearHighlightedIds?.();
    }
  }
}
