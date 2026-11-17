import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

// Tight bounds around Sol, Madrid (OSM boundary relation 8816050), shared by both bbox modes.
const BBOX: [number, number, number, number] = [-3.7089, 40.4135, -3.6992, 40.4204];

/** This is intentionally the only OSM example without pbfFileUrl. */
async function main(): Promise<void> {
    const mode = exampleVariant('Overpass query', { bbox: 'Bounding box', place: 'Named place', tags: 'Custom tag filters' });
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    // setView() would pin a zero-area origin, making the later fitBounds() over-zoom.
    map.draw();
    const button = document.createElement('button'); button.textContent = 'Load from Overpass';
    const controls = document.querySelector('.controls')!; controls.append(button);
    onExampleDispose(() => button.remove());
    button.addEventListener('click', () => {
        button.disabled = true;
        void runExample(async () => {
            try {
                const db = new AutkDb();
                await db.init();
                await db.loadOsm({
                    queryArea: mode === 'place' ? { geocodeArea: 'Comunidad de Madrid', areas: ['Sol'] }
                        : { bbox: BBOX },
                    autoLoadLayers: { layers: mode === 'tags'
                        ? ['surface', 'parks', 'water', 'roads']
                        : ['surface', 'parks', 'water', 'roads', 'buildings'] },
                    ...(mode === 'tags' ? { tagSets: [
                        { name: 'cafes', type: 'points' as const, tags: [{ key: 'amenity', value: 'cafe' }] },
                    ] } : {}),
                });
                for (const layer of [...map.layerManager.layers]) map.removeLayer(layer.layerInfo.id);
                const layers = db.getLayersMetadata();
                if (!layers.length) throw new Error('The query returned no renderable layers. Try another query.');
                for (const layer of layers) map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
                if (mode === 'tags') map.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });
                map.fitBounds();
                map.ui.setAttribution([{ text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }]);
                map.draw();
            } finally { button.disabled = false; }
        });
    });
}
void runExample(main);
