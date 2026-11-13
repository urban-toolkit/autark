/** Keep the map bars synchronized with the example's actual initialization promise. */
export function setExampleState(state: 'loading' | 'ready' | 'error', message?: string): void {
    document.querySelectorAll<HTMLElement>('[data-example-status]').forEach(status => {
        status.dataset.state = state;
        if (message !== undefined) status.textContent = message;
    });
    document.querySelectorAll<HTMLElement>('.map-stage').forEach(stage => {
        stage.setAttribute('aria-busy', String(state === 'loading'));
    });
}

export async function runExample(initialize: () => Promise<void>, preserveStatus = false): Promise<void> {
    setExampleState('loading', 'Loading map and data…');
    try {
        await initialize();
        fitExamplePlots();
        setExampleState('ready', preserveStatus ? undefined : 'Interactive map');
    } catch (error) {
        setExampleState('error', 'Unable to load map.');
        console.error('Unable to initialize the gallery example:', error);
    }
}

/** Preserve SVG coordinates for brushing while allowing charts to fit their side panels. */
function fitExamplePlots(): void {
    document.querySelectorAll<HTMLElement>('#plotBody').forEach(body => {
        const fit = () => {
            body.querySelectorAll<SVGSVGElement>(':scope > svg').forEach(svg => {
                const width = Number(svg.getAttribute('width'));
                const height = Number(svg.getAttribute('height'));
                if (width > 0 && height > 0) {
                    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                    svg.style.width = '100%';
                    svg.style.height = 'auto';
                }
            });
        };
        fit();
        const observer = new MutationObserver(fit);
        observer.observe(body, { childList: true, subtree: true });
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    });
}
