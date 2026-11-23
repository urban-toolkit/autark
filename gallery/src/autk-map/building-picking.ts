import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import type { Feature, FeatureCollection } from 'geojson';

const BASE_URL = (import.meta as any).env.BASE_URL;
const LAYER = 'table_osm_buildings';
/** Buildings without height tags still render, extruded to this default. */
const DEFAULT_HEIGHT = 20;

function text(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

/** Height in metres for one set of tags: explicit height, else 3 m per floor. */
function heightFrom(properties: Record<string, unknown> | null | undefined): number | null {
    if (!properties) return null;
    for (const key of ['height', 'building:height']) {
        const value = Number.parseFloat(String(properties[key] ?? ''));
        if (Number.isFinite(value) && value > 0) return value;
    }
    for (const key of ['building:levels', 'levels']) {
        const value = Number.parseFloat(String(properties[key] ?? ''));
        if (Number.isFinite(value) && value > 0) return value * 3;
    }
    return null;
}

/**
 * Buildings store heights on their parts, not only on the feature.
 * Report whether any part carries height data and the tallest part height.
 */
function heightOf(feature: Feature): { metres: number; measured: boolean } | null {
    const properties = (feature.properties ?? {}) as Record<string, unknown> & { parts?: Array<Record<string, unknown>> };
    const values = [heightFrom(properties), ...(Array.isArray(properties.parts) ? properties.parts.map(heightFrom) : [])]
        .filter((value): value is number => value !== null);
    return values.length ? { metres: Math.max(...values), measured: true } : null;
}

function summarize(buildings: FeatureCollection, ids: number[]): void {
    const features = ids.map(id => buildings.features[id]).filter((feature): feature is Feature => !!feature);
    const heights = features.map(heightOf);
    const measured = heights.filter((height): height is { metres: number; measured: boolean } => height !== null);
    const metres = measured.map(height => height.metres).sort((a, b) => b - a);
    const rendered = heights.map(height => height?.metres ?? DEFAULT_HEIGHT);
    const renderedAverage = rendered.length ? rendered.reduce((sum, value) => sum + value, 0) / rendered.length : 0;

    // Fixed-length copy keeps the panel from resizing as the selection changes.
    text('info-selection', 'Selection');
    text('info-title', features.length === 0 ? 'No buildings selected' : `${features.length} ${features.length === 1 ? 'building' : 'buildings'}`);
    text('info-help', 'Click toggles a building; empty space clears.');
    text('agg-count', String(features.length));
    text('agg-height-share', features.length === 0 ? '—' : `${measured.length} of ${features.length} (${Math.round(measured.length / features.length * 100)}%)`);
    text('agg-tallest', metres.length === 0 ? '—' : `${metres[0]!.toFixed(0)} m`);
    text('agg-average', features.length === 0 ? '—' : `${renderedAverage.toFixed(0)} m`);
    text('selection-status', features.length === 0 ? 'No selection'
        : `${features.length} selected · ${measured.length} with height data`);
    document.querySelector<HTMLButtonElement>('#clear-selection')!.disabled = features.length === 0;
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

    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
    if (new URLSearchParams(window.location.search).has('transform')) {
        const stage = canvas.parentElement!;
        stage.style.transformOrigin = 'top left';
        stage.style.transform = 'translate(12px, 8px) scale(0.8)';
    }
    const map = new AutkMap(canvas, { showUi: false });
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: layer.name === LAYER ? buildings : await db.getLayer(layer.name), type: layer.type });
    }
    map.updateRenderInfo(LAYER, { isPick: true });
    map.fitBounds();

    // Picking toggles ids, so repeated clicks accumulate a selection.
    map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
        if (layerId === LAYER) summarize(buildings, selection);
    });
    document.querySelector('#clear-selection')!.addEventListener('click', () => {
        map.setHighlightedIds(LAYER, []);
        summarize(buildings, []);
    });

    map.draw();
    summarize(buildings, []);
}
void runExample(main);
