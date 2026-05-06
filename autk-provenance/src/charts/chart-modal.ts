import type { ChartModalDescriptor } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createChartModalController(descriptors: ChartModalDescriptor[]): { syncSelection(): void; destroy(): void } {
  let active: ChartModalDescriptor | null = null;
  let backdrop: HTMLDivElement | null = null;
  let canvas: HTMLDivElement | null = null;
  let stage: HTMLDivElement | null = null;
  let modalTitle: HTMLDivElement | null = null;
  let modalSubtitle: HTMLDivElement | null = null;
  let scaleValue: HTMLSpanElement | null = null;
  let modalPlot: ChartModalDescriptor['originalPlot'] | null = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragActive = false;
  let dragX = 0;
  let dragY = 0;
  let spacePressed = false;
  let contentWidth = 960;
  let contentHeight = 620;
  const cleanups: Array<() => void> = [];

  function applyTransform(): void {
    if (!stage) return;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (scaleValue) scaleValue.textContent = `${Math.round(scale * 100)}%`;
  }

  function fit(): void {
    if (!canvas || !stage) return;
    const rect = canvas.getBoundingClientRect();
    const padding = 28;
    const fitScale = Math.min((rect.width - padding * 2) / contentWidth, (rect.height - padding * 2) / contentHeight);
    scale = clamp(Number.isFinite(fitScale) ? fitScale : 1, 0.3, 4);
    tx = (rect.width - contentWidth * scale) / 2;
    ty = (rect.height - contentHeight * scale) / 2;
    applyTransform();
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nextScale = clamp(scale * factor, 0.25, 6);
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const ratio = nextScale / scale;
    tx = localX - (localX - tx) * ratio;
    ty = localY - (localY - ty) * ratio;
    scale = nextScale;
    applyTransform();
  }

  function syncSelection(): void {
    if (active && modalPlot) modalPlot.setSelection([...active.originalPlot.selection]);
  }

  function clearModalPlot(): void {
    modalPlot = null;
    if (stage) stage.innerHTML = '';
  }

  function close(): void {
    clearModalPlot();
    backdrop?.remove();
    backdrop = null;
    canvas = null;
    stage = null;
    modalTitle = null;
    modalSubtitle = null;
    scaleValue = null;
    active = null;
    document.body.style.overflow = '';
  }

  function renderActivePlot(): void {
    if (!active || !stage || !canvas || !modalTitle || !modalSubtitle) return;
    modalTitle.textContent = active.title;
    modalSubtitle.textContent = active.subtitle;
    clearModalPlot();

    const host = document.createElement('div');
    stage.appendChild(host);
    contentWidth = Math.max(920, canvas.clientWidth - 48);
    contentHeight = Math.max(560, canvas.clientHeight - 48);
    stage.style.width = `${contentWidth}px`;
    stage.style.height = `${contentHeight}px`;
    host.style.width = `${contentWidth}px`;
    host.style.height = `${contentHeight}px`;

    modalPlot = active.createModalPlot(host, contentWidth, contentHeight);
    syncSelection();
    active.events.forEach((eventName) => {
      const listener = ({ selection }: { selection: number[] }) => {
        if (!active) return;
        active.originalPlot.setSelection([...selection]);
        active.originalPlot.events.emit(eventName as never, { selection: [...selection] } as never);
        requestAnimationFrame(syncSelection);
      };
      modalPlot!.events.on(eventName as never, listener as never);
    });

    requestAnimationFrame(fit);
  }

  function ensureModal(): void {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'autk-chart-modal-backdrop';
    backdrop.innerHTML = `
      <div class="autk-chart-modal" role="dialog" aria-modal="true" aria-label="Expanded chart view">
        <div class="autk-chart-modal-header">
          <div class="autk-chart-modal-heading">
            <div class="autk-chart-modal-title"></div>
            <div class="autk-chart-modal-subtitle"></div>
          </div>
          <div class="autk-chart-modal-controls">
            <button type="button" data-action="zoom-out">-</button>
            <button type="button" data-action="zoom-in">+</button>
            <button type="button" data-action="fit">Fit</button>
            <button type="button" data-action="reset">100%</button>
            <button type="button" data-action="close">Close</button>
          </div>
        </div>
        <div class="autk-chart-modal-body"><div class="autk-chart-modal-canvas"><div class="autk-chart-modal-stage"></div></div></div>
        <div class="autk-chart-modal-footer">
          <div>Mouse wheel to zoom. Hold Space and drag to pan. Press Esc to close.</div>
          <span class="autk-chart-modal-scale">100%</span>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    canvas = backdrop.querySelector('.autk-chart-modal-canvas');
    stage = backdrop.querySelector('.autk-chart-modal-stage');
    modalTitle = backdrop.querySelector('.autk-chart-modal-title');
    modalSubtitle = backdrop.querySelector('.autk-chart-modal-subtitle');
    scaleValue = backdrop.querySelector('.autk-chart-modal-scale');

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.85);
    });
    backdrop.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.15);
    });
    backdrop.querySelector('[data-action="fit"]')?.addEventListener('click', fit);
    backdrop.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      scale = 1;
      tx = 24;
      ty = 24;
      applyTransform();
    });
    backdrop.querySelector('[data-action="close"]')?.addEventListener('click', close);

    canvas?.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.9);
    }, { passive: false });
    canvas?.addEventListener('pointerdown', (event) => {
      if (!(spacePressed && event.button === 0)) return;
      dragActive = true;
      dragX = event.clientX;
      dragY = event.clientY;
      canvas!.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas?.addEventListener('pointermove', (event) => {
      if (!dragActive) return;
      tx += event.clientX - dragX;
      ty += event.clientY - dragY;
      dragX = event.clientX;
      dragY = event.clientY;
      applyTransform();
    });
    const endDrag = (event: PointerEvent) => {
      if (!dragActive || !canvas) return;
      dragActive = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    };
    canvas?.addEventListener('pointerup', endDrag);
    canvas?.addEventListener('pointercancel', endDrag);
  }

  function open(descriptor: ChartModalDescriptor): void {
    active = descriptor;
    ensureModal();
    document.body.style.overflow = 'hidden';
    renderActivePlot();
  }

  descriptors.forEach((descriptor) => {
    const openCurrent = () => open(descriptor);
    descriptor.trigger.addEventListener('click', openCurrent);
    descriptor.trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openCurrent();
    });
    descriptor.button?.addEventListener('click', (event) => {
      event.stopPropagation();
      openCurrent();
    });
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') spacePressed = true;
    if (event.key === 'Escape' && backdrop) close();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') spacePressed = false;
  };
  const handleResize = () => {
    if (backdrop && active) renderActivePlot();
  };
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', handleResize);
  cleanups.push(() => document.removeEventListener('keydown', handleKeyDown));
  cleanups.push(() => document.removeEventListener('keyup', handleKeyUp));
  cleanups.push(() => window.removeEventListener('resize', handleResize));

  return {
    syncSelection,
    destroy: () => {
      close();
      cleanups.splice(0).forEach((cleanup) => cleanup());
    },
  };
}
