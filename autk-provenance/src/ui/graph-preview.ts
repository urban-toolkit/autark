import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { buildGraphLayout, type GraphLayout } from './graph-layout';
import { createGraphScene, createSvgElement } from './graph-scene';

export function buildLayoutFromProvenance(
  provenance: AutarkProvenanceApi
): GraphLayout | null {
  const graph = provenance.getGraph();
  return graph.nodes.get(graph.rootId) ? buildGraphLayout(graph.nodes, graph.rootId) : null;
}

export function renderGraphPreview(options: {
  container: HTMLDivElement;
  provenance: AutarkProvenanceApi;
  showTimestamps: boolean;
}): void {
  const { container, provenance, showTimestamps } = options;
  const layout = buildLayoutFromProvenance(provenance);
  container.innerHTML = '';
  if (!layout) return;

  const svg = createSvgElement('svg');
  svg.classList.add('autk-provenance-graph-svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.appendChild(createGraphScene(layout, provenance.getCurrentNode()?.id ?? null, showTimestamps, (nodeId) => provenance.goToNode(nodeId)));
  container.appendChild(svg);
}
