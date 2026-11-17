import { AutkDb } from '@urban-toolkit/autk-db';
import { lonLatToCrs } from '@urban-toolkit/autk-core';
import type { FeatureCollection, Polygon } from 'geojson';
import { exampleCode } from '../code';
import { exampleSource } from '../source';

/** Exercise the real local-PBF page with mocked acquisition, without reading the bundled file. */
export async function runWebGpuCases() {
    const original = {
        loadOsm: AutkDb.prototype.loadOsm,
        setWorkspace: AutkDb.prototype.setWorkspace,
        getLayersMetadata: AutkDb.prototype.getLayersMetadata,
        getLayer: AutkDb.prototype.getLayer,
    };
    const url = location.href;
    const body = document.body.innerHTML;
    const bodyClass = document.body.className;
    const requests: Array<Parameters<AutkDb['loadOsm']>[0]> = [];
    let loaded = false;
    const bbox = [7.4158, 43.7293, 7.4322, 43.7378];
    const collection: FeatureCollection<Polygon> = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
            [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]
                .map(([lon, lat]) => lonLatToCrs('EPSG:3395', lon, lat)),
        ] } }],
    };
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const ready = async () => {
        const started = performance.now();
        while (document.querySelector<HTMLElement>('#map-status')?.dataset.state !== 'ready') {
            const status = document.querySelector<HTMLElement>('#map-status');
            if (status?.dataset.state === 'error' || performance.now() - started > 20000) {
                throw new Error(status?.textContent || 'Example timed out');
            }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    AutkDb.prototype.setWorkspace = async () => { loaded = false; };
    AutkDb.prototype.loadOsm = async function (params) {
        requests.push(params);
        loaded = true;
        return { osmElementCount: 0, boundaryElementCount: 0, osmDataProcessingMs: 0, boundariesProcessingMs: 0, layers: [] };
    };
    AutkDb.prototype.getLayersMetadata = () => loaded
        ? [{ name: 'surface', type: 'surface', source: 'geojson', columns: [] }] : [];
    AutkDb.prototype.getLayer = async () => collection;
    const checks: string[] = [];
    try {
        const htmlUrl = new URL('../src/autk-map/osm-layers-pbf.html', import.meta.url);
        const html = await fetch(htmlUrl).then(response => response.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = doc.body.innerHTML;
        document.body.className = doc.body.className;
        history.replaceState(null, '', `${htmlUrl.pathname}?variant=bbox`);
        await import('../src/autk-map/osm-layers-pbf');
        await ready();
        assert(requests.length === 1, 'Opening the page must load the bundled PBF once');
        assert(document.querySelector('.map-panel h2')?.textContent === 'La Condamine and Monaco-Ville', 'Map must identify both districts');
        for (const variant of ['bbox', 'place', 'tags']) {
            if (variant !== 'bbox') {
                const select = document.querySelector<HTMLSelectElement>('select[data-variant-parameter]')!;
                select.value = variant;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await ready();
            }
            const request = requests[['bbox', 'place', 'tags'].indexOf(variant)];
            assert(request.pbfFileUrl === '/data/monaco-condamine.osm.pbf', 'Every mode must use the bundled local PBF');
            if (variant === 'place') {
                assert(JSON.stringify(request.queryArea) === JSON.stringify({ geocodeArea: 'Monaco', areas: ['La Condamine', 'Monaco-Ville'] }), 'Named query must select both districts');
            } else {
                assert(JSON.stringify(request.queryArea) === JSON.stringify({ bbox }), 'Both bbox variants must use the same shared bounds');
            }
            assert(JSON.stringify(request.autoLoadLayers.layers) === JSON.stringify(variant === 'tags'
                ? ['surface', 'parks', 'water', 'roads'] : ['surface', 'parks', 'water', 'roads', 'buildings']),
                'The custom-tags variant must omit buildings');
            assert(JSON.stringify(request.tagSets) === JSON.stringify(variant === 'tags'
                ? [{ name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] }] : undefined),
                'Only the custom-tags variant should add the cafe tag set');
            for (const excerpt of [exampleCode('D06', { variant }), exampleSource('D06', { variant })]) {
                assert(excerpt.includes('monaco-condamine.osm.pbf'), 'Snippets must use the bundled Monaco extract');
                assert(excerpt.includes(variant === 'place' ? "areas: ['La Condamine', 'Monaco-Ville']" : bbox.join(', ')), 'Snippets must use the actual query area');
                assert(excerpt.includes('tagSets:') === (variant === 'tags'), 'Snippets must match custom-tag configuration');
                assert(!excerpt.includes('playgrounds'), 'Tag snippets must not retain playgrounds');
                assert(excerpt.includes('pointSize: 20') === (variant === 'tags'), 'Tag snippets must use the smaller cafe points');
                assert(excerpt.includes("'buildings']") === (variant !== 'tags'), 'Only the tag variant omits buildings');
            }
            checks.push(`${variant}: local PBF, matching districts/bounds, core call and minimal source`);
        }
        return { status: 'passed', checks };
    } finally {
        window.dispatchEvent(new Event('pagehide'));
        Object.assign(AutkDb.prototype, original);
        history.replaceState(null, '', url);
        document.body.innerHTML = body;
        document.body.className = bodyClass;
    }
}
