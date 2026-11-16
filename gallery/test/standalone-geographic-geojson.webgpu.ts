import { AutkMap } from '@urban-toolkit/autk-map';
import { DEFAULT_WORKSPACE_COORDINATE_FORMAT, lonLatToCrs } from '@urban-toolkit/autk-core';

/** Runs the actual standalone geographic example without a database or external data requests. */
export async function runWebGpuCases() {
    const nativeFetch = window.fetch;
    const loadCollection = AutkMap.prototype.loadCollection;
    const setView = AutkMap.prototype.setView;
    let map: AutkMap | undefined;
    let sourceCrs: string | undefined;
    let origin: number[] = [], eye: number[] = [];
    const errors: string[] = [], requests: string[] = [];
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(url);
        return nativeFetch(url.startsWith('/data/') ? `/gallery/public${url}` : input, init);
    }) as typeof fetch;
    AutkMap.prototype.setView = function (params) {
        map = this;
        this.renderer.device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        setView.call(this, params);
        origin = [...this.layerManager.origin]; eye = [...this.camera.getEye()];
    };
    AutkMap.prototype.loadCollection = function (id, params) {
        sourceCrs = params.sourceCrs;
        loadCollection.call(this, id, params);
    };
    try {
        const html = await fetch('/gallery/src/autk-map/standalone-geographic-geojson-vis.html').then(response => response.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = doc.body.innerHTML;
        document.body.className = doc.body.className;
        const style = document.createElement('style');
        style.textContent = await fetch('/gallery/example.css?direct').then(response => response.text());
        document.head.append(style);
        await import('../src/autk-map/standalone-geographic-geojson-vis');
        const started = performance.now();
        while (document.querySelector<HTMLElement>('#map-status')!.dataset.state !== 'ready') {
            const status = document.querySelector<HTMLElement>('#map-status')!;
            if (performance.now() - started > 20000 || status.dataset.state === 'error') throw new Error(`Example failed: ${status.textContent}`);
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert(!!map, 'Example did not create a map');
        assert(sourceCrs === 'EPSG:4326', 'Example must explicitly declare geographic input');
        assert(map!.workspaceCrs === DEFAULT_WORKSPACE_COORDINATE_FORMAT, 'Map and database must share the default CRS');
        assert(map!.layerManager.layers.length === 1, 'Neighborhood layer was not loaded');
        assert(map!.layerManager.origin.every((value, index) => value === origin[index]), 'Loading data changed the view-established origin');
        assert(map!.camera.getEye().every((value, index) => value === eye[index]), 'Loading data changed the camera');
        const expected = lonLatToCrs('EPSG:3395', -73.9712, 40.7831);
        assert(Math.abs(origin[0] - expected[0]) < 0.01 && Math.abs(origin[1] - expected[1]) < 0.01, 'View center was not projected');
        assert(requests.some(url => url.endsWith('mnt_neighs.geojson')), 'Example must fetch the existing unprojected dataset');
        assert(!requests.some(url => url.includes('duckdb') || url.endsWith('mnt_neighs_proj.geojson')), 'Standalone example must not use a database or preprojected dataset');
        await map!.renderer.device.queue.onSubmittedWorkDone();
        assert(errors.length === 0, errors.join('\n'));
        return { status: 'passed', checks: ['real geographic GeoJSON loaded without AutkDb', 'Proj4js conversion into the shared default CRS', 'setView origin and camera preserved during vector loading', 'WebGPU rendering without validation errors'] };
    } finally {
        map?.destroy();
        window.fetch = nativeFetch;
        AutkMap.prototype.loadCollection = loadCollection;
        AutkMap.prototype.setView = setView;
    }
}
