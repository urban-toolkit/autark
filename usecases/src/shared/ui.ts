/** Small DOM-only utilities shared by the case study pages. */
export function setLoadingState(message: string, note = ''): void {
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note;
}

export function hideLoading(): void {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

export function showError(message: string, note = 'Please reload the page and try again.'): void {
    const overlay = document.getElementById('loading-overlay');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('error');
    const title = document.getElementById('loading-title');
    if (title) title.textContent = 'Loading Error';
    setLoadingState(message, note);
}

/** Interaction errors must not cover the controls needed to retry. */
export function reportError(error: unknown): void {
    console.error(error);
    let status = document.getElementById('interaction-error');
    if (!status) {
        status = document.createElement('p');
        status.id = 'interaction-error';
        status.setAttribute('role', 'alert');
        status.style.cssText = 'position:fixed;bottom:1rem;left:1rem;z-index:1000;max-width:32rem;padding:1rem;background:#fff;color:#a00;box-shadow:0 2px 8px #0003';
        document.body.appendChild(status);
    }
    status.textContent = error instanceof Error ? error.message : 'The operation failed. Please try again.';
}

export function clearError(): void {
    document.getElementById('interaction-error')?.remove();
}

export function initDraggablePanel(panel: HTMLElement, bar: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    bar.style.touchAction = 'none';
    bar.addEventListener('pointerdown', (event) => {
        startX = event.clientX;
        startY = event.clientY;
        bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
        if (!bar.hasPointerCapture(event.pointerId)) return;
        const left = panel.offsetLeft + event.clientX - startX;
        const top = panel.offsetTop + event.clientY - startY;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        startX = event.clientX;
        startY = event.clientY;
    });
    bar.addEventListener('pointerup', (event) => {
        if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    });
}
