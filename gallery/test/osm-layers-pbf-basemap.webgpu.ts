import { AutkMap } from '@urban-toolkit/autk-map';
import { OsmLayersPbfBasemap } from '../src/autk-map/osm-layers-pbf-basemap';
import type { PbfBasemapOptions } from '../src/autk-map/osm-layers-pbf-basemap';

/** Real PBF parsing and database normalization; only external raster responses are fixtures. */
export async function checkPbfBasemap(options: PbfBasemapOptions) {
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const nativeFetch = window.fetch;
    const requested: string[] = [];
    const errors: string[] = [];
    const demCanvas = new OffscreenCanvas(256, 256);
    const context = demCanvas.getContext('2d')!;
    context.fillStyle = 'rgb(128,40,0)'; context.fillRect(0, 0, 256, 256);
    const dem = await demCanvas.convertToBlob({ type: 'image/png' });
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input); requested.push(url);
        if (url.includes('elevation-tiles-prod/terrarium/')) return Promise.resolve(new Response(dem));
        const imagery = url.startsWith('https://tile.openstreetmap.org/');
        return nativeFetch(imagery ? '/gallery/public/data/tile-basemap.png' : url.startsWith('/data/') ? `/gallery/public${url}` : input, init);
    }) as typeof fetch;
    const suffix = options.imagery && options.terrain ? 'imagery-terrain' : options.imagery ? 'imagery' : 'terrain';
    const example = new OsmLayersPbfBasemap(options);
    const originalTiles = AutkMap.prototype.loadTiles, originalTerrain = AutkMap.prototype.loadTerrain;
    const verifyContext = (map: AutkMap) => {
        assert(map.layerManager.layers.filter(layer => layer.layerInfo.typeLayer !== 'tiles').length === 5, 'Load all five PBF vector layers before geographic sources');
        assert(map.layerManager.hasOrigin && map.workspaceCrs === 'EPSG:3395', 'Vectors must initialize the normalized workspace');
        return JSON.stringify({ origin: map.layerManager.origin, eye: map.camera.getEye(), target: map.camera.getLookAt() });
    };
    AutkMap.prototype.loadTiles = function (id, params) {
        const before = verifyContext(this);
        assert(params.center === undefined && params.zoom === undefined, 'Imagery must reuse the vector view');
        originalTiles.call(this, id, params);
        assert(verifyContext(this) === before, 'Imagery changed the vector origin or camera');
    };
    AutkMap.prototype.loadTerrain = function (params) {
        const before = verifyContext(this);
        assert(params.center === undefined && params.zoom === undefined, 'Terrain must reuse the vector view');
        originalTerrain.call(this, params);
        assert(verifyContext(this) === before, 'Terrain changed the vector origin or camera');
    };
    let style: HTMLStyleElement | undefined;
    try {
        const html = await fetch(`/gallery/src/autk-map/osm-layers-pbf-${suffix}.html`).then(response => response.text());
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = parsed.body.innerHTML;
        document.body.className = parsed.body.className;
        style = document.createElement('style');
        style.textContent = (await Promise.all(['/gallery/src/autk-map/osm-layers-pbf.css', '/gallery/example.css'].map(path => fetch(`${path}?direct`).then(response => response.text())))).join('\n');
        document.head.append(style);
        await example.run(document.querySelector('canvas')!);
        const map = (example as unknown as { map: AutkMap }).map;
        map.renderer.device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        const status = document.querySelector<HTMLElement>('#map-status')!;
        const start = performance.now();
        while (status.textContent !== 'Interactive map') {
            assert(performance.now() - start < 30000, `PBF example did not settle: ${status.textContent}`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(requested.some(url => url.includes('lower_mnt.osm.pbf')), 'The actual bundled PBF must be parsed');
        assert(!!map.getTileStats('imagery') === !!options.imagery, 'Unexpected imagery layer');
        assert(!!map.getTerrainTileStats() === !!options.terrain, 'Unexpected terrain source');
        assert(!!document.querySelector('.autk-map-attribution a[href="https://www.openstreetmap.org/copyright"]'), 'Retain vector data attribution with or without imagery');
        const surface = map.layerManager.searchByLayerId('table_osm_surface')!;
        assert(surface.layerRenderInfo.isSkip === !!options.imagery, 'Reveal imagery below vectors while retaining the surface layer');
        const slider = document.querySelector<HTMLInputElement>('#building-opacity')!;
        slider.value = '0.4'; slider.dispatchEvent(new Event('input'));
        assert(map.layerManager.searchByLayerId('table_osm_buildings')!.layerRenderInfo.opacity === 0.4, 'Preserve building opacity controls');
        map.camera.pitch(-0.4);
        await new Promise(resolve => setTimeout(resolve, 500));
        await map.renderer.device.queue.onSubmittedWorkDone();
        assert(errors.length === 0, errors.join('\n'));
        assert(document.querySelector('.eyebrow')!.textContent!.includes('autk-map'), 'Preserve the gallery breadcrumb');
        assert(!!document.querySelector('.panel-header') && !!document.querySelector('.panel-footer'), 'Preserve map bars');
        return { status: 'passed', checks: [`PBF vectors first: ${suffix}`, 'shared origin, CRS, and camera without center/zoom', 'building opacity, tilt, loading status, and GPU validation'] };
    } finally {
        example.dispose(); style?.remove(); window.fetch = nativeFetch;
        AutkMap.prototype.loadTiles = originalTiles; AutkMap.prototype.loadTerrain = originalTerrain;
    }
}
