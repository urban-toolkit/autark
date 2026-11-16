import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import type { Feature, FeatureCollection } from 'geojson';

const BASE_URL = (import.meta as any).env.BASE_URL;
const LAYER = 'table_osm_buildings';

function set(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
}

function showDetails(buildings: FeatureCollection, pickedId: number | null): void {
    const feature = pickedId === null ? undefined : buildings.features[pickedId] as Feature | undefined;
    const props = (feature?.properties ?? {}) as Record<string, unknown>;
    const get = (...keys: string[]): string => {
        for (const key of keys) {
            const value = props[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
        }
        return '—';
    };
    const levels = get('building:levels', 'levels');
    const height = get('height');
    set('info-selection', feature ? 'Selected building' : 'Awaiting selection');
    set('info-help', feature ? 'Double-click another building to compare its attributes.'
        : 'Double-click a building on the map to see its details here.');
    set('info-title', feature ? get('name', 'addr:housename') === '—' ? `Building ${pickedId}` : get('name', 'addr:housename') : 'No building selected');
    set('info-osm-id', get('id', 'osm_id', '@id'));
    set('info-type', get('building'));
    set('info-height', height !== '—' ? height : levels !== '—' ? `~${(Number(levels) * 3).toFixed(0)} m (est.)` : '—');
    set('info-levels', levels);
    set('info-address', [get('addr:housenumber'), get('addr:street')].filter(value => value !== '—').join(' ') || '—');
}

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });
    const buildings: FeatureCollection = await db.getLayer(LAYER);

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: layer.name === LAYER ? buildings : await db.getLayer(layer.name), type: layer.type });
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
        set('visibility-status', `${hidden.size} ${hidden.size === 1 ? 'building' : 'buildings'} hidden`);
    };

    map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
        if (layerId !== LAYER) return;
        selected = selection.length === 0 ? null : selection[selection.length - 1]!;
        map.setHighlightedIds(LAYER, selected === null ? [] : [selected]);
        showDetails(buildings, selected);
        refresh();
    });

    hideButton.addEventListener('click', () => {
        if (selected === null || hidden.has(selected)) return;
        map.setSkippedIds(LAYER, [selected]);
        hidden.add(selected);
        selected = null;
        map.setHighlightedIds(LAYER, []);
        showDetails(buildings, null);
        refresh();
    });
    restoreButton.addEventListener('click', () => {
        map.clearSkippedIds(LAYER);
        hidden.clear();
        selected = null;
        map.setHighlightedIds(LAYER, []);
        showDetails(buildings, null);
        refresh();
    });

    map.draw();
    showDetails(buildings, null);
    refresh();
}
void runExample(main);
