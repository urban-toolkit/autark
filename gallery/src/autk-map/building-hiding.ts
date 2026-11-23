import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;
const LAYER = 'table_osm_buildings';

function set(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
}

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/boston-harbor.osm.pbf`,
        queryArea: { bbox: [-71.090, 42.340, -71.035, 42.377] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
    }
    map.updateRenderInfo(LAYER, { isPick: true });
    map.fitBounds();

    const hideButton = document.querySelector<HTMLButtonElement>('#hide-selected')!;
    const restoreButton = document.querySelector<HTMLButtonElement>('#restore-all')!;
    const hidden = new Set<number>();
    let selected: number | null = null;

    const refresh = () => {
        hideButton.disabled = selected === null;
        restoreButton.disabled = hidden.size === 0;
        set('map-status', hidden.size === 0 ? 'Interactive map'
            : `${hidden.size} ${hidden.size === 1 ? 'building' : 'buildings'} hidden`);
    };

    map.events.on(MapEvent.CLICK, ({ selection, layerId }) => {
        if (layerId !== LAYER) return;
        selected = selection.length === 0 ? null : selection[selection.length - 1]!;
        map.setHighlightedIds(LAYER, selected === null ? [] : [selected]);
        refresh();
    });

    hideButton.addEventListener('click', () => {
        if (selected === null || hidden.has(selected)) return;
        hidden.add(selected);
        map.setSkippedIds(LAYER, [...hidden]);
        selected = null;
        map.setHighlightedIds(LAYER, []);
        refresh();
    });
    restoreButton.addEventListener('click', () => {
        map.clearSkippedIds(LAYER);
        hidden.clear();
        selected = null;
        map.setHighlightedIds(LAYER, []);
        refresh();
    });

    map.draw();
    document.querySelector('.map-stage')?.setAttribute('aria-busy', 'false');
    refresh();
}
void runExample(main);
