import type { ProvenanceGraph } from '../types';
import type { InsightSelectionState, SelectionFrequency } from './types';

export function computeSelectionFrequency<T extends InsightSelectionState>(graph: ProvenanceGraph<T>): SelectionFrequency {
  const mapFreq = new Map<number, number>();
  const plotsFreq = new Map<string, Map<number, number>>();

  for (const node of graph.nodes.values()) {
    if (node.state.selection.map?.ids) {
      for (const id of node.state.selection.map.ids) {
        mapFreq.set(id, (mapFreq.get(id) ?? 0) + 1);
      }
    }

    for (const [plotId, plotSelection] of Object.entries(node.state.selection.plots ?? {})) {
      if (!plotSelection?.ids.length) continue;
      if (!plotsFreq.has(plotId)) plotsFreq.set(plotId, new Map());
      const plotFreq = plotsFreq.get(plotId)!;
      for (const id of plotSelection.ids) {
        plotFreq.set(id, (plotFreq.get(id) ?? 0) + 1);
      }
    }
  }

  return { map: mapFreq, plots: plotsFreq };
}
