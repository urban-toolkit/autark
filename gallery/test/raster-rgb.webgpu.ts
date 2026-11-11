/** Smoke-test the real gallery entry module and its controls after building workspace packages. */
export async function runWebGpuCases() {
    const errors: string[] = [];
    window.addEventListener('error', event => errors.push(event.message));
    window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const html = await fetch('/gallery/src/autk-map/raster-rgb.html').then(response => response.text());
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('script').forEach(script => script.remove());
    document.body.innerHTML = parsed.body.innerHTML;
    document.body.className = parsed.body.className;
    const style = document.createElement('style');
    style.textContent = (await Promise.all(['/gallery/src/autk-map/raster-rgb.css', '/gallery/example.css']
        .map(path => fetch(path).then(response => response.text())))).join('\n');
    document.head.append(style);
    await import('../src/autk-map/raster-rgb');
    const status = document.querySelector<HTMLElement>('#status')!;
    const started = performance.now();
    while (!status.textContent?.startsWith('RGB bytes')) {
        if (performance.now() - started > 15000) throw new Error(`Gallery startup failed: ${status.textContent}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const click = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!.click();
    const legend = document.querySelector<HTMLElement>('#autkMapLegend')!;
    assert(status.textContent!.includes('300480, 700320'), 'Gallery raster-only origin');
    assert(document.querySelector('#map-status')?.closest('.panel-header') != null, 'Loading status must be in the map header');
    assert(document.querySelector('.map-stage')?.getAttribute('aria-busy') === 'false', 'Initialized map must be ready');
    assert(document.querySelector('canvas')?.getAttribute('aria-describedby') === 'map-help', 'Map must reference its instruction bar');
    click('autkMapUi');
    assert(document.querySelectorAll('#layerListSection button:disabled').length === 1, 'RGB palette should be disabled');
    click('scalar');
    assert(legend.style.visibility === 'visible', 'Scalar gallery legend');
    assert(document.querySelectorAll('#layerListSection button:disabled').length === 0, 'Scalar palette should be enabled');
    click('rgb');
    assert(legend.style.visibility === 'hidden', 'RGB gallery legend');
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings++; };
    try { click('invalid-size'); click('invalid-range'); } finally { console.warn = warn; }
    assert(warnings === 2 && status.textContent!.includes('legend off'), 'Rejected gallery updates changed display mode');
    click('reflectance');
    assert(status.textContent!.includes('ignores the transparent outlier'), 'Reflectance control');
    click('normalized');
    assert(status.textContent!.includes('Normalized RGB'), 'Normalized range control');
    click('scalar');
    assert(legend.style.visibility === 'visible', 'Returning scalar gallery legend');
    click('fit');
    const opacity = document.querySelector<HTMLInputElement>('#opacity')!;
    opacity.value = '0.5';
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    assert(errors.length === 0, errors.join('\n'));
    return { status: 'passed', checks: ['real gallery startup and raster-only origin', 'RGB/scalar palette and legend controls',
        'dimension/range rejection warnings', 'reflectance/normalized controls', 'fit and opacity controls'] };
}
