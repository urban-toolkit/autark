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

const EVENT_ACTION_MAP: Record<string, ProvenanceAction> = {
  [PLOT_CLICK]: ProvenanceAction.PLOT_CLICK,
  [PLOT_BRUSH]: ProvenanceAction.PLOT_BRUSH,
  [PLOT_BRUSH_X]: ProvenanceAction.PLOT_BRUSH_X,
  [PLOT_BRUSH_Y]: ProvenanceAction.PLOT_BRUSH_Y,
};

function selectionSignature(selection: number[]): string {
  return selection.join(',');
}

function plotTypeLabel(plotType: string): string {
  return plotType.replace(/_/g, ' ');
}

interface PlotEntry {
  plot: IPlotForProvenance;
  listeners: Array<{ event: string; fn: (selection: number[]) => void }>;
  lastSelectionSig: string | null;
  dataDescriptorRestorer: (() => void) | null;
}

export function createPlotAdapter(
  plots: IPlotForProvenance[],
  onRecord: PlotRecordCallback
): PlotAdapterApi {
  let isApplyingState = false;

  const entries: PlotEntry[] = plots.map((plot) => ({
    plot,
    listeners: [],
    lastSelectionSig: null,
    dataDescriptorRestorer: null,
  }));

  function attachListeners(entry: PlotEntry): void {
    if (entry.listeners.length > 0) return;
    const { plot } = entry;

    for (const [event, actionType] of Object.entries(EVENT_ACTION_MAP)) {
      const fn = (selection: number[]) => {
        const sig = selectionSignature(selection);
        if (sig === entry.lastSelectionSig) return;
        entry.lastSelectionSig = sig;

        const typeLabel = plotTypeLabel(plot.plotType);
        const label =
          selection.length === 0
            ? `Cleared selection on ${typeLabel} (${plot.plotId})`
            : `${event}: ${selection.length} point(s) on ${typeLabel} (${plot.plotId})`;

        onRecord(actionType, label, {
          selection: {
            plots: {
              [plot.plotId]: { ids: selection, plotType: plot.plotType },
            },
          } as unknown as AutarkProvenanceState['selection'],
        });
      };
      entry.listeners.push({ event, fn });
      plot.plotEvents.addEventListener(event, fn);
    }
  }

  function detachListeners(entry: PlotEntry): void {
    const { plot } = entry;
    for (const { event, fn } of entry.listeners) {
      plot.plotEvents.removeEventListener?.(event, fn);
    }
    entry.listeners.length = 0;
  }

  function wrapDataSetter(entry: PlotEntry): void {
    if (entry.dataDescriptorRestorer) return;
    const plotObj = entry.plot as unknown as object;
    const proto = Object.getPrototypeOf(plotObj);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'data')
      ?? Object.getOwnPropertyDescriptor(plotObj, 'data');
    if (!descriptor?.set) return;

    const { plot } = entry;

    // Override on the instance to shadow the prototype property.
    // The original setter still runs so the plot's internal state stays correct.
    Object.defineProperty(plotObj, 'data', {
      get: descriptor.get ? () => descriptor.get!.call(plotObj) : undefined,
      set(value: unknown) {
        descriptor.set!.call(plotObj, value);
        if (!isApplyingState) {
          const dataLen = Array.isArray(value) ? value.length : 0;
          const label = `Data updated: ${dataLen} row(s) on ${plotTypeLabel(plot.plotType)} (${plot.plotId})`;
          // Reset selection for this plot — indices are no longer valid after a data swap.
          onRecord(ProvenanceAction.PLOT_DATA, label, {
            selection: {
              plots: { [plot.plotId]: { ids: [], plotType: plot.plotType } },
            } as unknown as AutarkProvenanceState['selection'],
          });
        }
      },
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
    });

    entry.dataDescriptorRestorer = () => {
      // Remove the own-property override so the prototype setter is visible again.
      try {
        delete (plotObj as Record<string, unknown>)['data'];
      } catch {
        // non-configurable — leave it
      }
    };
  }

  function unwrapDataSetter(entry: PlotEntry): void {
    entry.dataDescriptorRestorer?.();
    entry.dataDescriptorRestorer = null;
  }

  function startRecording(): void {
    for (const entry of entries) {
      attachListeners(entry);
      wrapDataSetter(entry);
    }
  }

  function stopRecording(): void {
    for (const entry of entries) {
      detachListeners(entry);
      unwrapDataSetter(entry);
    }
  }

  function applyState(state: AutarkProvenanceState): void {
    isApplyingState = true;
    try {
      const coordinatedIds = [...new Set([
        ...(state.selection?.map?.ids ?? []),
        ...Object.values(state.selection?.plots ?? {}).flatMap((plotState) => plotState.ids),
      ])];

      for (const entry of entries) {
        entry.lastSelectionSig = selectionSignature(coordinatedIds);
        entry.plot.setHighlightedIds(coordinatedIds);
      }
    } finally {
      isApplyingState = false;
    }
  }

  return {
    startRecording,
    stopRecording,
    applyState,
  };
}
