import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

/** This is intentionally the only OSM example without pbfFileUrl. */
async function main(): Promise<void> {
    const mode = exampleVariant('Overpass query', { bbox: 'Bounding box', place: 'Named place', tags: 'Custom tag filters' });
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    map.setView({ center: { latitude: 40.707, longitude: -74.01 }, zoom: 14 });
    map.draw();
    const notice = document.createElement('p'); notice.className = 'example-note';
    notice.textContent = 'No OSM request is sent until you press Load. This live service may be unavailable or rate-limited; use the local PBF example for a reproducible city.';
    const button = document.createElement('button'); button.textContent = 'Load from Overpass';
    const controls = document.querySelector('.controls')!; controls.append(button); controls.after(notice);
    onExampleDispose(() => { button.remove(); notice.remove(); });
    button.addEventListener('click', () => {
        button.disabled = true;
        void runExample(async () => {
            try {
                const db = new AutkDb();
                await db.init();
                await db.loadOsm({
                    queryArea: mode === 'place' ? { geocodeArea: 'New York', areas: ['Battery Park City', 'Financial District'] }
                        : { bbox: [-74.019, 40.700, -74.003, 40.714] },
                    autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
                    ...(mode === 'tags' ? { tagSets: [
                        { name: 'playgrounds', type: 'polygons' as const, tags: [{ key: 'leisure', value: 'playground' }] },
                        { name: 'cafes', type: 'points' as const, tags: [{ key: 'amenity', value: 'cafe' }] },
                    ] } : {}),
                });
                for (const layer of [...map.layerManager.layers]) map.removeLayer(layer.layerInfo.id);
                const layers = db.getLayersMetadata();
                if (!layers.length) throw new Error('The query returned no renderable layers. Try another query.');
                for (const layer of layers) map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
                map.fitBounds();
                map.ui.setAttribution([{ text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }]);
            } finally { button.disabled = false; }
        });
    });
}
void runExample(main);
