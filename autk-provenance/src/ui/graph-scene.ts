import type { GraphLayout } from './graph-layout';
import { formatTime, truncate } from './utils';

export function createSvgElement<T extends keyof SVGElementTagNameMap>(
  tag: T
): SVGElementTagNameMap[T] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

export function createGraphScene(
  layout: GraphLayout,
  currentId: string | null,
  showTimestamps: boolean,
  onNodeClick: (nodeId: string) => void
): SVGGElement {
  const root = createSvgElement('g');
  const positionById = new Map(layout.nodes.map((item) => [item.node.id, item]));

  layout.edges.forEach((edge) => {
    const from = positionById.get(edge.from);
    const to = positionById.get(edge.to);
    if (!from || !to) return;
    const path = createSvgElement('path');
    const ctrlDx = Math.max(32, (to.x - from.x) * 0.55);
    path.setAttribute('d', `M ${from.x} ${from.y} C ${from.x + ctrlDx} ${from.y}, ${to.x - ctrlDx} ${to.y}, ${to.x} ${to.y}`);
    path.setAttribute('class', 'autk-provenance-edge');
    root.appendChild(path);
  });

  layout.nodes.forEach((item) => {
    const group = createSvgElement('g');
    const isCurrent = item.node.id === currentId;
    const hasAnnotation = typeof item.node.metadata?.insight === 'string' && `${item.node.metadata.insight}`.trim().length > 0;
    group.setAttribute('class', `autk-provenance-node${isCurrent ? ' autk-provenance-node-current' : ''}`);
    group.setAttribute('transform', `translate(${item.x}, ${item.y})`);
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      onNodeClick(item.node.id);
    });

    const circle = createSvgElement('circle');
    circle.setAttribute('class', 'autk-provenance-node-circle');
    circle.setAttribute('r', isCurrent ? '9' : '7');
    group.appendChild(circle);

    if (hasAnnotation) {
      const dot = createSvgElement('circle');
      dot.setAttribute('class', 'autk-provenance-node-insight-dot');
      dot.setAttribute('cx', isCurrent ? '7' : '5');
      dot.setAttribute('cy', isCurrent ? '-7' : '-5');
      dot.setAttribute('r', '4');
      group.appendChild(dot);
    }

    const title = createSvgElement('title');
    title.textContent = `${item.node.actionLabel} (${item.node.id})${hasAnnotation ? `\n"${`${item.node.metadata?.insight}`.trim()}"` : ''}`;
    group.appendChild(title);

    const label = createSvgElement('text');
    label.setAttribute('class', 'autk-provenance-node-label');
    label.setAttribute('x', '14');
    label.setAttribute('y', '-2');
    label.textContent = truncate(item.node.actionLabel);
    group.appendChild(label);

    if (showTimestamps) {
      const time = createSvgElement('text');
      time.setAttribute('class', 'autk-provenance-node-time');
      time.setAttribute('x', '14');
      time.setAttribute('y', '12');
      time.textContent = formatTime(item.node.timestamp);
      group.appendChild(time);
    }

    root.appendChild(group);
  });

  return root;
}
