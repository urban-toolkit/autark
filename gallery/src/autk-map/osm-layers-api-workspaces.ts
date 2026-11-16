import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;
const AREAS: Record<string, [number, number, number, number]> = {
    battery_park_city: [-74.019, 40.707, -74.012, 40.719],
    financial_district: [-74.014, 40.700, -74.003, 40.713],
};

/** One database, two workspaces: their tables never mix. */
async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    for (const [workspace, bbox] of Object.entries(AREAS)) {
        await db.setWorkspace(workspace);
        await db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: { bbox: bbox! },
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
        });
    }

    for (const [index, workspace] of Object.keys(AREAS).entries()) {
        const canvas = document.querySelector<HTMLCanvasElement>(`#map0${index + 1}`);
        if (!canvas) continue;
        const map = new AutkMap(canvas);
        await map.init();
        await db.setWorkspace(workspace);
        for (const layer of db.getLayersMetadata()) {
            map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
        }
        map.fitBounds();
        map.draw();
    }
}
void runExample(main);
