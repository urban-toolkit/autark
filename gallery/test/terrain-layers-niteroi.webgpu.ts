import { AutkMap } from '@urban-toolkit/autk-map';

/** Exercise both real entry points and the PBF without imagery or an Overpass fallback.
 * Buildings and streamed DEM responses are small fixtures; local GeoTIFF data is real.
 */
export async function checkNiteroiTerrain(mode: 'local' | 'streamed') {
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const nativeFetch = window.fetch, draw = AutkMap.prototype.draw, loadTerrain = AutkMap.prototype.loadTerrain, loadTiles = AutkMap.prototype.loadTiles;
    const requests: string[] = [], errors: string[] = [], warnings: string[] = [];
    const error = (event: ErrorEvent) => errors.push(event.message);
    const rejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
    const warn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); warn(...args); };
    window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection);
    const image = new OffscreenCanvas(256, 256), context = image.getContext('2d')!;
    context.fillStyle = 'rgb(128,40,0)'; context.fillRect(0, 0, 256, 256);
    const dem = await image.convertToBlob();
    const buildings = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { height: 20 }, geometry: {
        type: 'Polygon', coordinates: [[[-43.02486, -22.92951], [-43.02477, -22.92951], [-43.02477, -22.92957], [-43.02486, -22.92957], [-43.02486, -22.92951]]],
    } }] };
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); requests.push(url);
        if (/overpass|nominatim|api\.openstreetmap\.org/i.test(url)) throw new Error(`Unexpected OSM service request: ${url}`);
        if (url.includes('nit_buildings.geojson')) return Promise.resolve(new Response(JSON.stringify(buildings)));
        if (url.includes('elevation-tiles-prod/terrarium/')) return Promise.resolve(new Response(dem));
        return nativeFetch(url.startsWith('/data/') ? `/gallery/public${url}` : input, init);
    }) as typeof fetch;
    let map: AutkMap | undefined;
    AutkMap.prototype.draw = function (options) {
        map = this;
        this.renderer.device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        return draw.call(this, options);
    };
    AutkMap.prototype.loadTiles = function () { throw new Error('Neither Niterói terrain example should load imagery'); };
    AutkMap.prototype.loadTerrain = function (params) {
        assert(('collection' in params.source) === (mode === 'local'), 'Each entry point must select its own elevation source');
        return loadTerrain.call(this, { ...params, overlaySize: 128, ...(mode === 'streamed' ? { levels: 2, windowSize: 32 } : {}) });
    };
    let style: HTMLStyleElement | undefined;
    try {
        const name = mode === 'local' ? 'terrain-layers-niteroi' : 'terrain-layers-niteroi-streamed';
        const html = await fetch(`/gallery/src/autk-map/${name}.html`).then(response => response.text());
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = parsed.body.innerHTML; document.body.className = parsed.body.className;
        style = document.createElement('style');
        style.textContent = await fetch('/gallery/example.css?direct').then(response => response.text());
        document.head.append(style);
        if (mode === 'local') await import('../src/autk-map/terrain-layers-niteroi');
        else await import('../src/autk-map/terrain-layers-niteroi-streamed');
        const status = document.querySelector<HTMLElement>('#map-status')!;
        const start = performance.now();
        while (status.dataset.state !== 'ready') {
            assert(status.dataset.state !== 'error' && performance.now() - start < 90000, `Niterói failed to load: ${status.textContent}; ${errors.join('; ')}`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(!!map, 'The actual entry point must initialize a map');
        const loaded = map!;
        for (const type of ['surface', 'parks', 'water', 'roads', 'buildings']) {
            assert(loaded.layerManager.layers.some(layer => layer.layerInfo.typeLayer === type), `Missing ${type} layer`);
        }
        assert(!loaded.layerManager.layers.some(layer => layer.layerInfo.typeLayer === 'tiles'), 'Do not load imagery');
        assert(requests.some(url => url.endsWith('/data/niteroi.osm.pbf')), 'The bundled gallery PBF must be read');
        assert(requests.some(url => url.endsWith('/data/niteroi-elevation.tif')) === (mode === 'local'), 'Only local terrain should read the GeoTIFF');
        assert(requests.some(url => url.includes('elevation-tiles-prod/terrarium/')) === (mode === 'streamed'), 'Only streamed terrain should request DEM tiles');
        assert(!!loaded.getTerrainTileStats() === (mode === 'streamed'), 'Only streamed terrain should expose streaming statistics');
        assert(!requests.some(url => /overpass|nominatim|api\.openstreetmap\.org/i.test(url)), 'Do not query OSM services');
        assert(!warnings.some(message => /falling back to exact area names|No complete geocode boundary|Cannot reconstruct coastline|No coastline available/.test(message)), 'The PBF must contain complete boundaries and coastline context');
        assert(!!document.querySelector('a[href="https://www.openstreetmap.org/copyright"]'), 'Retain OSM attribution');
        loaded.camera.pitch(-0.2);
        await new Promise(resolve => setTimeout(resolve, 250));
        await loaded.renderer.device.queue.onSubmittedWorkDone();
        assert(!errors.length, errors.join('\n'));
        return { status: 'passed', checks: [`Niterói ${mode} terrain through its own entry point`, 'original surface, roads, parks, water, and buildings without imagery', 'correct elevation source; complete PBF boundaries; no OSM service requests', 'tilt and GPU validation'] };
    } finally {
        window.dispatchEvent(new Event('pagehide'));
        map?.destroy(); style?.remove(); window.fetch = nativeFetch; AutkMap.prototype.draw = draw; AutkMap.prototype.loadTerrain = loadTerrain; AutkMap.prototype.loadTiles = loadTiles;
        console.warn = warn; window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection);
    }
}

export async function runWebGpuCases() { return checkNiteroiTerrain('local'); }
