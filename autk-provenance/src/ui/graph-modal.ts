import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { clamp } from './utils';
import type { GraphLayout } from './graph-layout';
import { createGraphModalShell, type GraphModalShell } from './graph-modal-shell';
import { createGraphScene, createSvgElement } from './graph-scene';

export function createGraphModalController(options: {
  provenance: AutarkProvenanceApi;
  showTimestamps: boolean;
  buildLayout: () => GraphLayout | null;
  onRefresh: () => void;
}): { isOpen(): boolean; open(): void; close(): void; render(): void } {
  const { provenance, showTimestamps, buildLayout, onRefresh } = options;
  let open = false;
  let shell: GraphModalShell | null = null;
  let scene: SVGGElement | null = null;
  let layout: GraphLayout | null = null;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let transformInitialized = false;

  const applyTransform = () => scene?.setAttribute('transform', `translate(${translateX} ${translateY}) scale(${scale})`);
  const fitView = () => {
    if (!shell || !layout || !scene) return;
    const width = Math.max(1, shell.canvas.clientWidth);
    const height = Math.max(1, shell.canvas.clientHeight);
    scale = clamp(Math.min((width - 104) / Math.max(1, layout.width), (height - 104) / Math.max(1, layout.height)), 0.25, 6);
    translateX = (width - layout.width * scale) / 2;
    translateY = (height - layout.height * scale) / 2;
    transformInitialized = true;
    applyTransform();
  };
  const zoom = (factor: number, clientX?: number, clientY?: number) => {
    if (!shell || !scene) return;
    const rect = shell.canvas.getBoundingClientRect();
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    const nextScale = clamp(scale * factor, 0.25, 6);
    const localX = x - rect.left;
    const localY = y - rect.top;
    const ratio = nextScale / scale;
    translateX = localX - (localX - translateX) * ratio;
    translateY = localY - (localY - translateY) * ratio;
    scale = nextScale;
    transformInitialized = true;
    applyTransform();
  };
  const ensureShell = () => shell ?? (shell = createGraphModalShell({
    onClose: () => { controller.close(); onRefresh(); },
    onFit: fitView,
    onZoom: zoom,
    onPan: (deltaX, deltaY) => { translateX += deltaX; translateY += deltaY; transformInitialized = true; applyTransform(); },
  }));

  const controller = {
    isOpen: () => open,
    open: () => { open = true; transformInitialized = false; controller.render(); },
    close: () => { open = false; scene = null; layout = null; transformInitialized = false; shell?.destroy(); shell = null; },
    render: () => {
      if (!open) return;
      const modalShell = ensureShell();
      modalShell.canvas.innerHTML = '';
      layout = buildLayout();
      if (!layout) return;

      const svg = createSvgElement('svg');
      svg.classList.add('autk-provenance-modal-svg');
      svg.setAttribute('viewBox', `0 0 ${Math.max(320, Math.floor(modalShell.canvas.clientWidth))} ${Math.max(260, Math.floor(modalShell.canvas.clientHeight))}`);
      svg.setAttribute('width', String(Math.max(320, Math.floor(modalShell.canvas.clientWidth))));
      svg.setAttribute('height', String(Math.max(260, Math.floor(modalShell.canvas.clientHeight))));
      scene = createGraphScene(layout, provenance.getCurrentNode()?.id ?? null, showTimestamps, (nodeId) => provenance.goToNode(nodeId));
      svg.appendChild(scene);
      modalShell.canvas.appendChild(svg);
      transformInitialized ? applyTransform() : fitView();
    },
  };

  return controller;
}
