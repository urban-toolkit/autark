import type { AutarkProvenanceState } from '../../types';
import { ProvenanceAction } from '../../types';

export type LayerLike = {
  layerInfo?: { id: string };
  setHighlightedIds?(ids: number[]): void;
  clearHighlightedIds?(): void;
  layerRenderInfo?: { isSkip?: boolean; isColorMap?: boolean };
};

export type ResolvedUiState = {
  mapMenuOpen: boolean;
  activeLayerId: string | null;
  visibleLayerIds: string[];
  thematicEnabled: boolean;
};

export type MapRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

export interface CustomControlConfig {
  selector: string;
  event: 'click' | 'change';
  actionType: ProvenanceAction | string;
  getLabel(el: Element): string;
  getStateDelta(el: Element): Partial<AutarkProvenanceState>;
  applyState?(el: Element, state: AutarkProvenanceState): void;
}

export interface MapSelectorConfig {
  menuIcon?: string;
  subMenu?: string;
  thematicCheckbox?: string;
  legend?: string;
  activeLayerRadioClass?: string;
  visibleLayerList?: string;
  customControls?: CustomControlConfig[];
}

export interface ResolvedMapSelectors {
  menuIcon: string;
  subMenu: string;
  thematicCheckbox: string;
  legend: string;
  activeLayerRadioClass: string;
  visibleLayerList: string;
}
