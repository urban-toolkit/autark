import type { GraphLayout } from './graph-layout';
import { clamp } from './utils';

export type GraphModalState = {
  backdrop: HTMLDivElement | null;
  canvas: HTMLDivElement | null;
  scene: SVGGElement | null;
  layout: GraphLayout | null;
  scale: number;
  tx: number;
  ty: number;
  initialized: boolean;
  open: boolean;
};

export function createGraphModalState(): GraphModalState {
  return {
    backdrop: null,
    canvas: null,
    scene: null,
    layout: null,
    scale: 1,
    tx: 0,
    ty: 0,
    initialized: false,
    open: false,
  };
}

export function applySceneTransform(state: GraphModalState): void {
  if (!state.scene) return;
  state.scene.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`);
}

export function fitGraphToView(state: GraphModalState): void {
  if (!state.canvas || !state.layout || !state.scene) return;
  const viewportWidth = Math.max(1, state.canvas.clientWidth);
  const viewportHeight = Math.max(1, state.canvas.clientHeight);
  const padding = 52;
  const scaleX = (viewportWidth - padding * 2) / Math.max(1, state.layout.width);
  const scaleY = (viewportHeight - padding * 2) / Math.max(1, state.layout.height);
  const fitScale = clamp(Math.min(scaleX, scaleY), 0.25, 6);
  state.scale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  state.tx = (viewportWidth - state.layout.width * state.scale) / 2;
  state.ty = (viewportHeight - state.layout.height * state.scale) / 2;
  state.initialized = true;
  applySceneTransform(state);
}

export function zoomGraph(
  state: GraphModalState,
  factor: number,
  clientX?: number,
  clientY?: number
): void {
  if (!state.canvas || !state.scene) return;
  const rect = state.canvas.getBoundingClientRect();
  const x = clientX === undefined ? rect.left + rect.width / 2 : clientX;
  const y = clientY === undefined ? rect.top + rect.height / 2 : clientY;
  const localX = x - rect.left;
  const localY = y - rect.top;
  const nextScale = clamp(state.scale * factor, 0.25, 6);
  const ratio = nextScale / state.scale;
  state.tx = localX - (localX - state.tx) * ratio;
  state.ty = localY - (localY - state.ty) * ratio;
  state.scale = nextScale;
  state.initialized = true;
  applySceneTransform(state);
}

export function resetGraphModalState(state: GraphModalState): void {
  state.backdrop?.remove();
  state.backdrop = null;
  state.canvas = null;
  state.scene = null;
  state.layout = null;
  state.initialized = false;
}
