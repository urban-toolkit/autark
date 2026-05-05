import type { AutarkProvenanceState, PathNode } from '../types';
import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { formatTime } from './utils';

export function renderPathList(
  container: HTMLElement,
  path: PathNode<AutarkProvenanceState>[],
  provenance: AutarkProvenanceApi,
  showTimestamps: boolean
): void {
  container.innerHTML = '';
  const currentId = provenance.getCurrentNode()?.id ?? null;
  const graph = provenance.getGraph();

  for (const node of path) {
    const isCurrent = node.id === currentId;
    const item = document.createElement('div');
    item.className = `autk-provenance-path-item${isCurrent ? ' autk-provenance-path-item-current' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node-id', node.id);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'autk-provenance-path-label';
    labelSpan.textContent = node.actionLabel;
    item.appendChild(labelSpan);

    const graphNode = graph.nodes.get(node.id);
    const hasAnnotation =
      typeof graphNode?.metadata?.insight === 'string' &&
      (graphNode.metadata.insight as string).trim().length > 0;
    if (hasAnnotation) {
      const dot = document.createElement('span');
      dot.title = graphNode!.metadata!.insight as string;
      dot.style.cssText =
        'display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0';
      item.appendChild(dot);
    }

    if (showTimestamps) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'autk-provenance-path-time';
      timeSpan.textContent = formatTime(node.timestamp);
      item.appendChild(timeSpan);
    }

    item.addEventListener('click', () => {
      provenance.goToNode(node.id);
    });

    container.appendChild(item);
  }
}
