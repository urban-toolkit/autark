/** Run real gallery controls against the local tile source, with optional database-loaded roads. */
export async function checkTilesGallery(withRoads = false) {
    const nativeFetch = window.fetch;
    const errors: string[] = [];
    const requests: string[] = [];
    const error = (event: ErrorEvent) => errors.push(event.message);
    const rejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
    window.addEventListener('error', error);
    window.addEventListener('unhandledrejection', rejection);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(url);
        // Exercise remote preset switching with deterministic local image data.
        const fixture = url.startsWith('https://tile.openstreetmap.org/');
        return nativeFetch(fixture ? '/gallery/public/data/tile-basemap.png' : url.startsWith('/data/') ? `/gallery/public${url}` : input, init);
    }) as typeof fetch;
    try {
        const name = withRoads ? 'tiles-categorical' : 'tiles-basemap';
        const html = await fetch(`/gallery/src/autk-map/${name}.html`).then(response => response.text());
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = parsed.body.innerHTML;
        document.body.className = parsed.body.className;
        const style = document.createElement('style');
        style.textContent = (await Promise.all(['/gallery/src/autk-map/tiles-basemap.css', '/gallery/example.css']
            .map(path => fetch(path).then(response => response.text())))).join('\n');
        document.head.append(style);
        const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
        const sources = document.querySelector<HTMLSelectElement>('#source-select')!;
        assert([...sources.options].map(option => option.value).join(',') === 'esriWorldImagery,osmLight,osmDark,openStreetMap,local', 'Source order must include all OSM themes and keep local last');
        assert(sources.value === 'osmLight', 'Start with the muted OSM light basemap');
        assert([...sources.options].map(option => option.text).join('|') === 'Esri World Imagery|OpenStreetMap (Light)|OpenStreetMap (Dark)|OpenStreetMap|Local test tiles', 'Use consistent source labels');
        sources.value = 'local';
        assert(document.querySelectorAll('.tile-controls button').length === 2 && !document.querySelector('#view-neighborhood'), 'Only Overview and Tilt view buttons');
        if (withRoads) await import('../src/autk-map/tiles-categorical');
        else await import('../src/autk-map/tiles-basemap');
        const status = document.querySelector<HTMLElement>('#map-status')!;
        const wait = async (predicate: () => boolean) => {
            const start = performance.now();
            while (!predicate()) {
                if (performance.now() - start > 40000 || status.dataset.state === 'error') throw new Error(`Tile gallery failed: ${status.textContent}; ${errors.join('; ')}`);
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        };
        const click = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!.click();
        const checkCredits = () => {
            const strip = document.querySelector<HTMLElement>('.autk-map-attribution')!;
            const autark = strip.querySelector<HTMLAnchorElement>('a[href="https://www.autarkjs.org"]')!;
            assert(autark?.textContent === 'Made with Autark' && autark.target === '_blank' && autark.rel.includes('noopener'), 'Autark credit must be a safe external link');
            const box = strip.getBoundingClientRect();
            const canvas = document.querySelector('canvas')!.getBoundingClientRect();
            assert(Math.abs(box.left - canvas.left - 10) < 1 && Math.abs(canvas.bottom - box.bottom - 10) < 1, 'Credits must sit at the bottom left of the canvas');
            assert(box.right <= canvas.right && box.top >= canvas.top, 'Credits must wrap inside the map');
            const links = [...strip.querySelectorAll('a')].map(link => getComputedStyle(link));
            assert(links.every(style => style.font === links[0]!.font && style.color === links[0]!.color && style.textDecoration === links[0]!.textDecoration), 'Credit links must share typography, color, and decoration');
            if (withRoads) {
                const legend = document.querySelector<HTMLElement>('#autkMapLegend')!;
                const rect = legend.getBoundingClientRect();
                if (legend.style.visibility === 'visible') assert(box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom, 'Credits must not overlap the thematic legend');
            }
        };
        await wait(() => status.textContent === 'Interactive map' && (withRoads || Number(document.querySelector('#stat-drawn')!.textContent!.split('/')[0].trim()) > 0));
        checkCredits();
        const checks = [withRoads ? 'database-projected roads with tile imagery' : 'standalone tiles without a data collection'];
        assert(!requests.some(url => url.includes('mnt_neighs')), 'Neighborhood data must not be loaded');
        if (!withRoads) assert(!requests.some(url => url.includes('.geojson')), 'Standalone tile map must not fetch GeoJSON');
        assert(document.querySelector('.autk-map-attribution')!.textContent!.includes('synthetic'), 'Local attribution missing');
        assert((document.querySelector('.map-stage .opacity-control') !== null) === !withRoads, 'Combined example should not have imagery opacity');
        assert((document.querySelector('.details-panel #stat-cache') !== null) === !withRoads, 'Only standalone tiles should have a statistics panel');
        click('autkMapUi');
        const layers = document.querySelector('#layerListSection')!;
        assert(layers.textContent!.includes('imagery'), 'Tile layer missing');
        assert(layers.textContent!.includes('roads') === withRoads, 'Unexpected road overlay');
        if (withRoads) {
            const legend = document.querySelector<HTMLElement>('#autkMapLegend')!;
            assert(legend.style.visibility === 'visible', 'Numeric category legend missing');
            const labels = [...legend.querySelectorAll('text')].map(text => text.textContent);
            assert(labels.filter(label => ['3', '1', '2'].includes(label!)).join(',') === '3,1,2', `Category order changed: ${labels}`);
        }
        click('autkMapUi');
        for (const id of ['view-overview', 'view-tilted']) { click(id); await wait(() => status.textContent === 'Interactive map'); }
        for (const key of ['osmLight', 'osmDark', 'local']) {
            sources.value = key; sources.dispatchEvent(new Event('change'));
            await wait(() => status.textContent === 'Interactive map');
            checkCredits();
            const attribution = document.querySelector('.autk-map-attribution')!.textContent!;
            assert(attribution.includes(key === 'local' ? 'synthetic' : 'OpenStreetMap'), 'Attribution must follow the source');
            if (withRoads) assert(document.querySelector<HTMLElement>('#autkMapLegend')!.style.visibility === 'visible', 'Source switching must retain the overlay legend');
        }
        assert(requests.some(url => url.startsWith('https://tile.openstreetmap.org/')), 'OSM raster endpoint must be requested');
        checks.push('OpenStreetMap (Light)/(Dark) and local switching, attribution, overview and tilt, expected layers and legend');
        const visibility = document.querySelector<HTMLInputElement>('#show-tiles')!;
        visibility.checked = false; visibility.dispatchEvent(new Event('change'));
        await wait(() => status.textContent === 'Tiles hidden');
        assert(document.querySelector('.autk-map-attribution')!.textContent === 'Made with Autark', 'Hiding imagery must remove provider credits and keep the Autark link');
        const count = document.querySelector('#stat-frame-count')?.textContent;
        await new Promise(resolve => setTimeout(resolve, 600));
        if (!withRoads) assert(document.querySelector('#stat-frame-count')!.textContent === count, 'Polling hidden tiles should not keep rendering');
        visibility.checked = true; visibility.dispatchEvent(new Event('change'));
        await wait(() => status.textContent === 'Interactive map');
        if (!withRoads) {
            const opacity = document.querySelector<HTMLInputElement>('#opacity')!;
            opacity.value = '0.5'; opacity.dispatchEvent(new Event('input'));
            assert(document.querySelector('#opacity-value')!.textContent === '50%', 'Opacity readout');
        }
        checks.push(withRoads ? 'visibility with categorical overlay retained' : 'visibility, idle statistics, cached resume, and opacity');
        assert(errors.length === 0, errors.join('\n'));
        window.dispatchEvent(new Event('pagehide'));
        return { status: 'passed', checks };
    } finally {
        window.fetch = nativeFetch;
        window.removeEventListener('error', error);
        window.removeEventListener('unhandledrejection', rejection);
    }
}

export async function runWebGpuCases() { return checkTilesGallery(); }
