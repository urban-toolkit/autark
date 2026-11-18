import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const BBOX: [number, number, number, number] = [13.030, 47.790, 13.065, 47.815];
const BUILDINGS = 'table_osm_buildings';
const DISTRICTS = 'salzburg-districts';

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/salzburg.osm.pbf`,
        queryArea: { bbox: BBOX },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type,
            loadConfig: { buildingsZeroHeight: true } });
    }
    // Stadt Salzburg's Stadtteile dataset, grouped by district and cropped to BBOX.
    const response = await fetch(`${BASE_URL}data/salzburg-districts.geojson`);
    if (!response.ok) throw new Error(`Could not load Salzburg districts: HTTP ${response.status}`);
    map.loadCollection(DISTRICTS, { collection: await response.json(), type: 'polygons', sourceCrs: 'EPSG:4326' });
    map.updateRenderInfo(DISTRICTS, { strokeColor: { r: 25, g: 54, b: 117, alpha: 1 } });
    map.fitBounds();
    map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);

    for (const [id, layer] of [['opacity', BUILDINGS], ['district-opacity', DISTRICTS]]) {
        const slider = document.querySelector<HTMLInputElement>(`#${id}`)!;
        const output = document.querySelector<HTMLOutputElement>(`#${id}-value`)!;
        const updateOpacity = () => {
            map.updateRenderInfo(layer, { opacity: slider.valueAsNumber });
            output.value = `${Math.round(slider.valueAsNumber * 100)}%`;
            slider.setAttribute('aria-valuetext', output.value);
        };
        updateOpacity();
        slider.addEventListener('input', updateOpacity);
        slider.disabled = false;
    }

    const borders = document.querySelector<HTMLInputElement>('#show-borders')!;
    const updateBorder = () => map.updateRenderInfo(DISTRICTS, { showBorders: borders.checked });
    updateBorder();
    borders.addEventListener('change', updateBorder);
    borders.disabled = false;
    map.draw();
}
void runExample(main);
