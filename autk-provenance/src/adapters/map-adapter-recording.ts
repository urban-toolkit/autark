import type { AutarkProvenanceState } from '../types';
import type { CustomControlConfig } from './map-adapter-shared';

export function bindCustomControlEvent(
  customControls: CustomControlConfig[],
  eventName: CustomControlConfig['event'],
  target: Element,
  onRecord: (
    actionType: string,
    actionLabel: string,
    stateDelta: Partial<AutarkProvenanceState>
  ) => void
): boolean {
  for (const ctrl of customControls) {
    if (ctrl.event !== eventName) continue;
    const matchEl = target.matches(ctrl.selector) ? target : target.closest(ctrl.selector);
    if (!matchEl) continue;
    onRecord(ctrl.actionType, ctrl.getLabel(matchEl), ctrl.getStateDelta(matchEl));
    return true;
  }
  return false;
}
