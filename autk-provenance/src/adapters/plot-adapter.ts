import type { AutarkProvenanceState, IPlotForProvenance } from '../types';
import { ProvenanceAction } from '../types';

const PLOT_CLICK = 'click';
const PLOT_BRUSH = 'brush';
const PLOT_BRUSH_X = 'brushX';
const PLOT_BRUSH_Y = 'brushY';

export type PlotRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

export interface PlotAdapterApi {
  startRecording(): void;
  stopRecording(): void;
  applyState(state: AutarkProvenanceState): void;
}

function makeListener(
  eventName: string,
  actionType: ProvenanceAction,
  onRecord: PlotRecordCallback
): (selection: number[]) => void {
  return (selection: number[]) => {
    const label =
      selection.length === 0
        ? `Cleared plot selection`
        : `${eventName}: ${selection.length} point(s) selected`;
    onRecord(actionType, label, {
      selection: {
        map: null,
        plot: selection,
      },
    });
  };
}

export function createPlotAdapter(
  plot: IPlotForProvenance,
  onRecord: PlotRecordCallback
): PlotAdapterApi {
  const listeners: Array<{ event: string; fn: (selection: number[]) => void }> = [];
  const events: Array<{ event: string; actionType: ProvenanceAction }> = [
    { event: PLOT_CLICK, actionType: ProvenanceAction.PLOT_CLICK },
    { event: PLOT_BRUSH, actionType: ProvenanceAction.PLOT_BRUSH },
    { event: PLOT_BRUSH_X, actionType: ProvenanceAction.PLOT_BRUSH_X },
    { event: PLOT_BRUSH_Y, actionType: ProvenanceAction.PLOT_BRUSH_Y },
  ];

  function startRecording(): void {
    if (listeners.length > 0) return;
    for (const { event, actionType } of events) {
      const fn = makeListener(event, actionType, onRecord);
      listeners.push({ event, fn });
      plot.plotEvents.addEventListener(event, fn);
    }
  }

  function stopRecording(): void {
    for (const { event, fn } of listeners) {
      if (plot.plotEvents.removeEventListener) {
        plot.plotEvents.removeEventListener(event, fn);
      }
    }
    listeners.length = 0;
  }

  function applyState(state: AutarkProvenanceState): void {
    const plotSelection = state.selection?.plot;
    if (Array.isArray(plotSelection)) {
      plot.setHighlightedIds(plotSelection);
    }
  }

  return {
    startRecording,
    stopRecording,
    applyState,
  };
}
