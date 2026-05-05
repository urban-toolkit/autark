import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { buildGraphLayout, type GraphLayout } from './graph-layout';
import { ensureGraphModalDom } from './graph-modal-dom';
import {
  applySceneTransform,
  createGraphModalState,
  fitGraphToView,
  resetGraphModalState,
  zoomGraph,
  type GraphModalState,
} from './graph-modal-utils';
import { createGraphScene, createSvgElement } from './graph-scene';

export interface GraphModalController {
  isOpen(): boolean;
  open(): void;
  close(): void;
  render(): void;
  destroy(): void;
}

interface CreateGraphModalControllerOptions {
  provenance: AutarkProvenanceApi;
  showTimestamps: boolean;
  getEnabled(): boolean;
  onRefresh(): void;
}

export function createGraphModalController(
  options: CreateGraphModalControllerOptions
): GraphModalController {
  const { provenance, showTimestamps, getEnabled, onRefresh } = options;
  const state: GraphModalState = createGraphModalState();

  function close(): void {
    state.open = false;
    resetGraphModalState(state);
  }

  function ensureModal(): void {
    ensureGraphModalDom({
      state,
      onClose: () => {
        close();
        onRefresh();
      },
      onZoomIn: () => zoomGraph(state, 1.2),
      onZoomOut: () => zoomGraph(state, 0.84),
      onFit: () => fitGraphToView(state),
      onWheelZoom: (event) => {
        event.preventDefault();
        zoomGraph(state, event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
      },
      onPanMove: (dx, dy) => {
        state.tx += dx;
        state.ty += dy;
        state.initialized = true;
        applySceneTransform(state);
      },
    });
  }

  function render(): void {
    if (!state.open || !getEnabled()) return;
    ensureModal();
    if (!state.canvas) return;

    state.canvas.innerHTML = '';
    const graph = provenance.getGraph();
    if (!graph.nodes.get(graph.rootId)) return;

    const currentId = provenance.getCurrentNode()?.id ?? null;
    state.layout = buildGraphLayout(graph.nodes, graph.rootId);

    const viewportWidth = Math.max(320, Math.floor(state.canvas.clientWidth));
    const viewportHeight = Math.max(260, Math.floor(state.canvas.clientHeight));

    const svg = createSvgElement('svg');
    svg.classList.add('autk-provenance-modal-svg');
    svg.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
    svg.setAttribute('width', String(viewportWidth));
    svg.setAttribute('height', String(viewportHeight));

    state.scene = createGraphScene(state.layout, currentId, showTimestamps, (nodeId) => {
      provenance.goToNode(nodeId);
    });
    svg.appendChild(state.scene);
    state.canvas.appendChild(svg);

    if (!state.initialized) {
      fitGraphToView(state);
    } else {
      applySceneTransform(state);
    }
  }

  return {
    isOpen: () => state.open,
    open: () => {
      if (!getEnabled()) return;
      state.open = true;
      state.initialized = false;
      render();
    },
    close,
    render,
    destroy: () => resetGraphModalState(state),
  };
}
