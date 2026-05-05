import type { GraphModalState } from './graph-modal-utils';

interface EnsureGraphModalDomOptions {
  state: GraphModalState;
  onClose(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onWheelZoom(event: WheelEvent): void;
  onPanMove(dx: number, dy: number): void;
}

export function ensureGraphModalDom(options: EnsureGraphModalDomOptions): void {
  const { state, onClose, onZoomIn, onZoomOut, onFit, onWheelZoom, onPanMove } = options;
  if (state.backdrop) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'autk-provenance-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'autk-provenance-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Provenance graph');

  const header = document.createElement('div');
  header.className = 'autk-provenance-modal-header';
  header.innerHTML =
    '<div class="autk-provenance-modal-title">Provenance Graph</div>' +
    '<div class="autk-provenance-modal-controls">' +
    '<button type="button" aria-label="Zoom out">\u2212</button>' +
    '<button type="button" aria-label="Zoom in">+</button>' +
    '<button type="button" aria-label="Fit graph to view">Fit</button>' +
    '<button type="button" aria-label="Close graph modal">Close</button>' +
    '</div>';

  const body = document.createElement('div');
  body.className = 'autk-provenance-modal-body';
  const canvas = document.createElement('div');
  canvas.className = 'autk-provenance-modal-canvas';
  body.appendChild(canvas);
  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  const [zoomOutBtn, zoomInBtn, fitBtn, closeBtn] = Array.from(header.querySelectorAll('button'));
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) onClose();
  });
  closeBtn?.addEventListener('click', onClose);
  zoomInBtn?.addEventListener('click', onZoomIn);
  zoomOutBtn?.addEventListener('click', onZoomOut);
  fitBtn?.addEventListener('click', onFit);
  canvas.addEventListener('wheel', onWheelZoom, { passive: false });

  let panning = false;
  let lastX = 0;
  let lastY = 0;

  const stopPanning = (event: PointerEvent) => {
    if (!panning) return;
    panning = false;
    canvas.classList.remove('autk-provenance-panning');
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.autk-provenance-node')) return;
    panning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.classList.add('autk-provenance-panning');
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!panning) return;
    onPanMove(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', stopPanning);
  canvas.addEventListener('pointercancel', stopPanning);

  document.body?.appendChild(backdrop);
  state.backdrop = backdrop;
  state.canvas = canvas;
}
