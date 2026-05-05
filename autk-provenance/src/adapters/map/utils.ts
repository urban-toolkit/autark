import type { AutarkProvenanceState, IMapForProvenance } from '../../types';
import type { LayerLike, MapSelectorConfig, ResolvedMapSelectors, ResolvedUiState } from './types';

export function resolveMapSelectors(config?: MapSelectorConfig): ResolvedMapSelectors {
  return {
    menuIcon: config?.menuIcon ?? '#menuIcon',
    subMenu: config?.subMenu ?? '#autkMapSubMenu',
    thematicCheckbox: config?.thematicCheckbox ?? '#showThematicCheckbox',
    legend: config?.legend ?? '#autkMapLegend',
    activeLayerRadioClass: config?.activeLayerRadioClass ?? '.active-layer-radio',
    visibleLayerList: config?.visibleLayerList ?? '#visibleLayerDropdownList',
  };
}

export function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && 'nodeType' in value;
}

export function getAllLayers(map: IMapForProvenance): LayerLike[] {
  return [...(map.layerManager.vectorLayers ?? []), ...(map.layerManager.rasterLayers ?? [])] as LayerLike[];
}

export function getLayerIds(map: IMapForProvenance): string[] {
  return getAllLayers(map)
    .map((layer) => layer.layerInfo?.id)
    .filter((id): id is string => typeof id === 'string');
}

export function getVisibleLayerIds(map: IMapForProvenance): string[] {
  return getAllLayers(map)
    .filter((layer) => !layer.layerRenderInfo?.isSkip)
    .map((layer) => layer.layerInfo?.id)
    .filter((id): id is string => typeof id === 'string');
}

export function getActiveLayerId(map: IMapForProvenance): string | null {
  return map.ui?.activeLayer?.layerInfo?.id ?? null;
}

export function getThematicEnabled(map: IMapForProvenance): boolean {
  return !!map.ui?.activeLayer?.layerRenderInfo?.isColorMap;
}

export function getMenuOpen(map: IMapForProvenance, selectors: ResolvedMapSelectors): boolean {
  const submenu = map.canvas.parentElement?.querySelector(selectors.subMenu) as HTMLElement | null;
  return submenu?.style.visibility === 'visible';
}

export function resolveUiState(
  map: IMapForProvenance,
  ui: AutarkProvenanceState['ui']
): ResolvedUiState {
  return {
    mapMenuOpen: ui?.mapMenuOpen ?? false,
    activeLayerId: ui?.activeLayerId ?? getActiveLayerId(map) ?? getLayerIds(map)[0] ?? null,
    visibleLayerIds: Array.isArray(ui?.visibleLayerIds) ? ui.visibleLayerIds : getLayerIds(map),
    thematicEnabled: ui?.thematicEnabled ?? false,
  };
}

export function setLayerRenderFlag(
  map: IMapForProvenance,
  layerId: string,
  property: 'isSkip' | 'isColorMap',
  value: boolean
): void {
  if (map.updateRenderInfoProperty) return void map.updateRenderInfoProperty(layerId, property, value);
  const layer = map.layerManager.searchByLayerId(layerId);
  if (layer?.layerRenderInfo) layer.layerRenderInfo[property] = value;
}
