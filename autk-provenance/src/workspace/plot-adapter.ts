import type { PlotBaseInteractive } from 'autk-plot';
import { PlotEvent } from 'autk-plot';
import { PlotType } from '../types';

export function createWorkspacePlotAdapter(plot: PlotBaseInteractive, plotId: string, plotType: PlotType) {
  return Object.assign(plot, {
    plotId,
    plotType,
    plotEvents: {
      addEventListener(event: string, fn: (selection: number[]) => void) {
        plot.events.on(event as PlotEvent, ({ selection }: { selection: number[] }) => fn(selection));
      },
      removeEventListener(event: string, fn: (selection: number[]) => void) {
        plot.events.off(event as PlotEvent, fn as never);
      },
    },
    setOwnedSelection(ids: number[]) {
      plot.setLocalSelection(ids);
    },
    setHighlightedIds(ids: number[]) {
      plot.setSelection(ids);
    },
  });
}
