import type { CustomControlConfig, MapSelectorConfig, ResolvedMapSelectors } from './map-adapter-types';

export type {
  CustomControlConfig,
  LayerLike,
  MapAdapterApi,
  MapRecordCallback,
  MapSelectorConfig,
  ResolvedMapSelectors,
  ResolvedUiState,
} from './map-adapter-types';

export function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && 'nodeType' in value;
}

export function resolveMapSelectors(selectorConfig?: MapSelectorConfig): {
  selectors: ResolvedMapSelectors;
  customControls: CustomControlConfig[];
} {
  return {
    selectors: {
      menuIcon: selectorConfig?.menuIcon ?? '#menuIcon',
      subMenu: selectorConfig?.subMenu ?? '#autkMapSubMenu',
      thematicCheckbox: selectorConfig?.thematicCheckbox ?? '#showThematicCheckbox',
      legend: selectorConfig?.legend ?? '#autkMapLegend',
      activeLayerRadioClass: selectorConfig?.activeLayerRadioClass ?? '.active-layer-radio',
      visibleLayerList: selectorConfig?.visibleLayerList ?? '#visibleLayerDropdownList',
    },
    customControls: selectorConfig?.customControls ?? [],
  };
}
