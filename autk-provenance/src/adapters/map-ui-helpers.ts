import type { AutarkProvenanceState, IMapForProvenance } from '../types';
import type { CustomControlConfig, LayerLike, ResolvedMapSelectors, ResolvedUiState } from './map-adapter-types';
import { isElement } from './map-adapter-shared';

export function createMapUiHelpers(
  map: IMapForProvenance,
  selectors: ResolvedMapSelectors,
  customControls: CustomControlConfig[]
) {
  const getAllLayers = (): LayerLike[] =>
    [...(map.layerManager.vectorLayers ?? []), ...(map.layerManager.rasterLayers ?? [])] as LayerLike[];

  const getVisibleLayerIds = (): string[] =>
    getAllLayers()
      .filter((layer) => !layer.layerRenderInfo?.isSkip)
      .map((layer) => layer.layerInfo?.id)
      .filter((id): id is string => typeof id === 'string');

  const getActiveLayerId = (): string | null => map.ui?.activeLayer?.layerInfo?.id ?? null;
  const getThematicEnabled = (): boolean => !!map.ui?.activeLayer?.layerRenderInfo?.isColorMap;

  function getMenuOpen(): boolean {
    const parent = map.canvas.parentElement;
    if (!parent) return false;
    const submenu = parent.querySelector(selectors.subMenu) as HTMLElement | null;
    return submenu ? submenu.style.visibility === 'visible' : false;
  }

  function resolveUiState(ui: AutarkProvenanceState['ui']): ResolvedUiState {
    const allLayerIds = getAllLayers()
      .map((layer) => layer.layerInfo?.id)
      .filter((id): id is string => typeof id === 'string');
    return {
      mapMenuOpen: ui?.mapMenuOpen ?? false,
      activeLayerId: ui?.activeLayerId ?? getActiveLayerId() ?? map.layerManager.vectorLayers?.[0]?.layerInfo?.id ?? null,
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
    if (layer?.layerRenderInfo) layer.layerRenderInfo[property] = value;
  }

  function syncUiDom(ui: ResolvedUiState): void {
    const parent = map.canvas.parentElement;
    if (!parent) return;

    const submenu = parent.querySelector(selectors.subMenu) as HTMLElement | null;
    if (submenu) submenu.style.visibility = ui.mapMenuOpen ? 'visible' : 'hidden';
    const thematicCheckbox = parent.querySelector(selectors.thematicCheckbox) as HTMLInputElement | null;
    if (thematicCheckbox) thematicCheckbox.checked = ui.thematicEnabled;
    const legend = parent.querySelector(selectors.legend) as HTMLElement | null;
    if (legend) legend.style.visibility = ui.thematicEnabled ? 'visible' : 'hidden';

    const visibleSet = new Set(ui.visibleLayerIds);
    parent.querySelectorAll(`${selectors.visibleLayerList} input[type="checkbox"]`).forEach((el) => {
      (el as HTMLInputElement).checked = visibleSet.has((el as HTMLInputElement).value);
    });
    parent.querySelectorAll(selectors.activeLayerRadioClass).forEach((el) => {
      const radio = el as HTMLInputElement;
      radio.checked = !!ui.activeLayerId && radio.value === ui.activeLayerId;
    });
  }

  function syncCustomControlsDom(state: AutarkProvenanceState): void {
    const parent = map.canvas.parentElement;
    if (!parent || customControls.length === 0) return;
    for (const ctrl of customControls) {
      if (!ctrl.applyState) continue;
      const el = parent.querySelector(ctrl.selector);
      if (el) ctrl.applyState(el, state);
    }
  }

  const inMapContainer = (target: EventTarget | null): boolean => {
    const parent = map.canvas.parentElement;
    return isElement(target) && !!parent && parent.contains(target);
  };

  const buildUiDelta = (overrides: Partial<NonNullable<AutarkProvenanceState['ui']>> = {}): Partial<AutarkProvenanceState> => ({
    ui: {
      mapMenuOpen: getMenuOpen(),
      activeLayerId: getActiveLayerId(),
      visibleLayerIds: getVisibleLayerIds(),
      thematicEnabled: getThematicEnabled(),
      ...overrides,
    },
  });

  return {
    getAllLayers,
    getVisibleLayerIds,
    getActiveLayerId,
    getThematicEnabled,
    resolveUiState,
    setLayerRenderFlag,
    syncUiDom,
    syncCustomControlsDom,
    inMapContainer,
    buildUiDelta,
  };
}
