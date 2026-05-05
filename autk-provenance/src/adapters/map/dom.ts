import type { AutarkProvenanceState, IMapForProvenance } from '../../types';
import type { CustomControlConfig, ResolvedMapSelectors, ResolvedUiState } from './types';

export function syncUiDom(
  map: IMapForProvenance,
  selectors: ResolvedMapSelectors,
  ui: ResolvedUiState
): void {
  const parent = map.canvas.parentElement;
  if (!parent) return;

  const submenu = parent.querySelector(selectors.subMenu) as HTMLElement | null;
  if (submenu) submenu.style.visibility = ui.mapMenuOpen ? 'visible' : 'hidden';

  const thematic = parent.querySelector(selectors.thematicCheckbox) as HTMLInputElement | null;
  if (thematic) thematic.checked = ui.thematicEnabled;

  const legend = parent.querySelector(selectors.legend) as HTMLElement | null;
  if (legend) legend.style.visibility = ui.thematicEnabled ? 'visible' : 'hidden';

  const visibleSet = new Set(ui.visibleLayerIds);
  parent
    .querySelectorAll(`${selectors.visibleLayerList} input[type="checkbox"]`)
    .forEach((input) => {
      const checkbox = input as HTMLInputElement;
      checkbox.checked = visibleSet.has(checkbox.value);
    });

  parent.querySelectorAll(selectors.activeLayerRadioClass).forEach((input) => {
    const radio = input as HTMLInputElement;
    radio.checked = !!ui.activeLayerId && radio.value === ui.activeLayerId;
  });
}

export function syncCustomControlsDom(
  map: IMapForProvenance,
  customControls: CustomControlConfig[],
  state: AutarkProvenanceState
): void {
  const parent = map.canvas.parentElement;
  if (!parent) return;
  customControls.forEach((control) => {
    const element = control.applyState ? parent.querySelector(control.selector) : null;
    if (element && control.applyState) control.applyState(element, state);
  });
}

export function isTargetInMapContainer(
  map: IMapForProvenance,
  target: Element
): boolean {
  return !!map.canvas.parentElement?.contains(target);
}
