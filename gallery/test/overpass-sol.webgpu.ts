import { AutkDb } from '@urban-toolkit/autk-db';
import { lonLatToCrs } from '@urban-toolkit/autk-core';
import type { FeatureCollection, Polygon } from 'geojson';
import { exampleCode } from '../code';
import { exampleSource } from '../source';

/** Exercise the real three-mode page with mocked acquisition, without hitting a busy public server. */
export async function runWebGpuCases() {
    const original = {
        init: AutkDb.prototype.init,
        loadOsm: AutkDb.prototype.loadOsm,
        getLayersMetadata: AutkDb.prototype.getLayersMetadata,
        getLayer: AutkDb.prototype.getLayer,
    };
    const url = location.href;
    const body = document.body.innerHTML;
    const bodyClass = document.body.className;
    const requests: Array<Parameters<AutkDb['loadOsm']>[0]> = [];
    const bbox = [-3.7089, 40.4135, -3.6992, 40.4204];
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
    AutkDb.prototype.init = async () => {};
    AutkDb.prototype.loadOsm = async function (params) {
        requests.push(params);
        return { osmElementCount: 0, boundaryElementCount: 0, osmDataProcessingMs: 0, boundariesProcessingMs: 0, layers: [] };
    };
    AutkDb.prototype.getLayersMetadata = () => [{ name: 'surface', type: 'surface', source: 'geojson', columns: [] }];
    AutkDb.prototype.getLayer = async () => collection;
    const checks: string[] = [];
    try {
        const htmlUrl = new URL('../src/autk-map/osm-layers-api.html', import.meta.url);
        const html = await fetch(htmlUrl).then(response => response.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script').forEach(script => script.remove());
        document.body.innerHTML = doc.body.innerHTML;
        document.body.className = doc.body.className;
        history.replaceState(null, '', `${htmlUrl.pathname}?variant=bbox`);
        await import('../src/autk-map/osm-layers-api');
        await ready();
        assert(requests.length === 0, 'Opening the page must not query Overpass');
        assert(document.querySelector('.map-panel h2')?.textContent === 'Sol, Madrid', 'Map must identify the small study area');
        for (const variant of ['bbox', 'place', 'tags']) {
            if (variant !== 'bbox') {
                const select = document.querySelector<HTMLSelectElement>('select[data-variant-parameter]')!;
                select.value = variant;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await ready();
            }
            const before = requests.length;
            assert(before === ['bbox', 'place', 'tags'].indexOf(variant), 'Changing the variant must not query Overpass');
            const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Load from Overpass')!;
            button.click();
            await ready();
            assert(requests.length === before + 1, 'Load must acquire exactly once');
            const request = requests[before];
            assert(!request.pbfFileUrl, 'The live example must not silently use a local PBF');
            if (variant === 'place') {
                assert(JSON.stringify(request.queryArea) === JSON.stringify({ geocodeArea: 'Comunidad de Madrid', areas: ['Sol'] }), 'Named query must select Sol, Madrid');
            } else {
                assert(JSON.stringify(request.queryArea) === JSON.stringify({ bbox }), 'Both bbox variants must use the same tight Sol bounds');
            }
            assert((request.tagSets?.length ?? 0) === (variant === 'tags' ? 1 : 0), 'Only the custom-tags variant should add the cafe tag set');
            assert(JSON.stringify(request.autoLoadLayers.layers) === JSON.stringify(variant === 'tags'
                ? ['surface', 'parks', 'water', 'roads'] : ['surface', 'parks', 'water', 'roads', 'buildings']),
                'The custom-tags variant must omit buildings');
            for (const excerpt of [exampleCode('D05', { variant }), exampleSource('D05', { variant })]) {
                assert(!excerpt.includes('New York') && !excerpt.includes('-74.019'), 'Code snippets must not retain the old city');
                assert(excerpt.includes(variant === 'place' ? "areas: ['Sol']" : bbox.join(', ')), 'Snippets must use the actual query area');
                assert(excerpt.includes('tagSets:') === (variant === 'tags'), 'Snippets must match custom-tag configuration');
                assert(!excerpt.includes('playgrounds'), 'Tag snippets must not retain playgrounds');
                assert(excerpt.includes('pointSize: 20') === (variant === 'tags'), 'Tag snippets must use the smaller cafe points');
                assert(excerpt.includes('buildings') === (variant !== 'tags'), 'Only the tag variant omits buildings');
            }
            checks.push(`${variant}: explicit loading, Sol region, matching core call and minimal source`);
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
