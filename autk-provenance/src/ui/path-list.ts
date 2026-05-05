import type { AutarkProvenanceApi } from '../create-autark-provenance';
import type { AutarkProvenanceState, PathNode } from '../types';
import { formatTime } from './utils';

export function renderPathList(options: {
  container: HTMLDivElement;
  provenance: AutarkProvenanceApi;
  path: PathNode<AutarkProvenanceState>[];
  showTimestamps: boolean;
}): void {
  const { container, provenance, path, showTimestamps } = options;
  const currentId = provenance.getCurrentNode()?.id ?? null;
  const graph = provenance.getGraph();
  container.innerHTML = '';

  path.forEach((node) => {
    const item = document.createElement('div');
    item.className = `autk-provenance-path-item${node.id === currentId ? ' autk-provenance-path-item-current' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node-id', node.id);

    const label = document.createElement('span');
    label.className = 'autk-provenance-path-label';
    label.textContent = node.actionLabel;
    item.appendChild(label);

    const annotation = graph.nodes.get(node.id)?.metadata?.insight;
    if (typeof annotation === 'string' && annotation.trim().length > 0) {
      const dot = document.createElement('span');
      dot.title = annotation;
      dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0';
      item.appendChild(dot);
    }

    if (showTimestamps) {
      const time = document.createElement('span');
      time.className = 'autk-provenance-path-time';
      time.textContent = formatTime(node.timestamp);
      item.appendChild(time);
    }

    item.addEventListener('click', () => provenance.goToNode(node.id));
    container.appendChild(item);
  });
}
