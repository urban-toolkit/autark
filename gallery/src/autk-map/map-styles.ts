import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const BBOX: [number, number, number, number] = [12.300, 45.420, 12.360, 45.450];
async function main(): Promise<void> {
    const style = document.querySelector<HTMLSelectElement>('#variant')!;
    const initialStyle = new URL(location.href).searchParams.get('variant');
    if ([...style.options].some(option => option.value === initialStyle)) style.value = initialStyle!;

    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/venice.osm.pbf`,
        queryArea: { bbox: BBOX },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    map.style.setPredefinedStyle(style.value);
    await map.init();

    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type,
            loadConfig: { buildingsZeroHeight: true } });
    }
    map.fitBounds();
    map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);
    map.draw();

    style.addEventListener('change', () => {
        map.style.setPredefinedStyle(style.value);
        const url = new URL(location.href);
        url.searchParams.set('variant', style.value);
        history.replaceState(null, '', url);
    });
    style.disabled = false;
}
void runExample(main);
