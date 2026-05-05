export interface GraphModalShell {
  canvas: HTMLDivElement;
  destroy(): void;
}

export function createGraphModalShell(options: {
  onClose: () => void;
  onFit: () => void;
  onZoom: (factor: number, clientX?: number, clientY?: number) => void;
  onPan: (deltaX: number, deltaY: number) => void;
}): GraphModalShell {
  const { onClose, onFit, onZoom, onPan } = options;
  const backdrop = document.createElement('div');
  const modal = document.createElement('div');
  const header = document.createElement('div');
  const title = document.createElement('div');
  const controls = document.createElement('div');
  const body = document.createElement('div');
  const canvas = document.createElement('div');

  backdrop.className = 'autk-provenance-modal-backdrop';
  modal.className = 'autk-provenance-modal';
  header.className = 'autk-provenance-modal-header';
  title.className = 'autk-provenance-modal-title';
  controls.className = 'autk-provenance-modal-controls';
  body.className = 'autk-provenance-modal-body';
  canvas.className = 'autk-provenance-modal-canvas';
  title.textContent = 'Provenance Graph';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Provenance graph');

  const makeButton = (text: string, onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    controls.appendChild(button);
    return button;
  };

  makeButton('\u2212', () => onZoom(0.84));
  makeButton('+', () => onZoom(1.2));
  makeButton('Fit', onFit);
  makeButton('Close', onClose);

  header.appendChild(title);
  header.appendChild(controls);
  body.appendChild(canvas);
  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  document.body?.appendChild(backdrop);

  let panning = false;
  let lastX = 0;
  let lastY = 0;
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    onZoom(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  };

  canvas.addEventListener('wheel', handleWheel, { passive: false });
  backdrop.addEventListener('click', (event) => event.target === backdrop && onClose());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement | null)?.closest('.autk-provenance-node')) return;
    panning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.classList.add('autk-provenance-panning');
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!panning) return;
    onPan(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const stopPanning = (event: PointerEvent) => {
    if (!panning) return;
    panning = false;
    canvas.classList.remove('autk-provenance-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', stopPanning);
  canvas.addEventListener('pointercancel', stopPanning);

  return { canvas, destroy: () => backdrop.remove() };
}
