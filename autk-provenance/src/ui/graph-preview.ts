import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { buildGraphLayout } from './graph-layout';
import { createGraphScene, createSvgElement } from './graph-scene';

export function renderGraphPreview(
  container: HTMLElement,
  provenance: AutarkProvenanceApi,
  showTimestamps: boolean
): void {
  container.innerHTML = '';

  const graph = provenance.getGraph();
  const currentId = provenance.getCurrentNode()?.id ?? null;
  if (!graph.nodes.get(graph.rootId)) return;

  const layout = buildGraphLayout(graph.nodes, graph.rootId);
  const svg = createSvgElement('svg');
  svg.classList.add('autk-provenance-graph-svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.appendChild(
    createGraphScene(layout, currentId, showTimestamps, (nodeId) => {
      provenance.goToNode(nodeId);
    })
  );

  container.appendChild(svg);
}
