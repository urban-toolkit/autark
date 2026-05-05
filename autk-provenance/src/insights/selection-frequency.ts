import type { AutarkProvenanceState, ProvenanceGraph } from '../types';
import type { SelectionFrequency } from './types';

export function computeSelectionFrequency(
  graph: ProvenanceGraph<AutarkProvenanceState>
): SelectionFrequency {
  const mapFreq = new Map<number, number>();
  const plotsFreq = new Map<string, Map<number, number>>();

  for (const node of graph.nodes.values()) {
    const sel = node.state.selection;
    if (sel?.map?.ids) {
      for (const id of sel.map.ids) {
        mapFreq.set(id, (mapFreq.get(id) ?? 0) + 1);
      }
    }
    for (const [plotId, plotSel] of Object.entries(sel?.plots ?? {})) {
      if (!plotSel?.ids?.length) continue;
      if (!plotsFreq.has(plotId)) plotsFreq.set(plotId, new Map());
      const freq = plotsFreq.get(plotId)!;
      for (const id of plotSel.ids) {
        freq.set(id, (freq.get(id) ?? 0) + 1);
      }
    }
  }

  return { map: mapFreq, plots: plotsFreq };
}
