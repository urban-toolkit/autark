import { csvParse } from 'd3-dsv';
import type { FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { lonLatToCrs } from '@urban-toolkit/autk-core';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';

const DATA_URL = `${import.meta.env.BASE_URL}data/`;
export const airports = [132, 138];
export const origins = [237, 186, 79, 87, ...airports];
export const destinations = [161, 162, 163, 164, 186, 230];
export const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
export const hourBuckets = hours.map(hour => `2000-01-01T${hour}:00Z`);

export type TaxiTrip = { hour: number; weekend: boolean; minutes: number; fare: number };
export type TaxiZone = { id: number; name: string; center: [number, number] };
export type TaxiZones = FeatureCollection<Polygon | MultiPolygon, TaxiZone>;

export async function loadTaxiData() {
    const [tripsResponse, zonesResponse] = await Promise.all([
        fetch(`${DATA_URL}taxi-gallery-trips.csv`), fetch(`${DATA_URL}taxi-gallery-zones.geojson`),
    ]);
    if (!tripsResponse.ok || !zonesResponse.ok) throw new Error('Could not load the bundled NYC taxi data.');
    const [csv, zoneData]: [string, TaxiZones] = await Promise.all([tripsResponse.text(), zonesResponse.json()]);
    const routes = new Map<string, TaxiTrip[]>();
    for (const row of csvParse(csv)) {
        const key = `${row.pickup}:${row.dropoff}`;
        if (!routes.has(key)) routes.set(key, []);
        routes.get(key)!.push({ hour: +row.hour, weekend: row.weekend === '1', minutes: +row.seconds / 60, fare: +row.cents / 100 });
    }
    const zones = new Map(zoneData.features.map(feature => [feature.properties.id, feature.properties]));
    return { routes, zones, zoneData };
}

export function chartCollection<T extends Record<string, unknown>>(rows: T[]): FeatureCollection<Point, T> {
    return { type: 'FeatureCollection', features: rows.map(properties => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties,
    })) };
}

/** Accessible zone selectors mirror the map and continue to work without WebGPU. */
export function zoneOptions(select: HTMLSelectElement, ids: number[], zones: Map<number, TaxiZone>, value: number): void {
    select.replaceChildren(...ids.map(id => new Option(zones.get(id)!.name, String(id))));
    select.value = String(value);
}

export async function taxiMap(zoneData: TaxiZones, selectable: number[], pick: (id: number) => void, cityOnly = false) {
    const canvas = document.querySelector<HTMLCanvasElement>('#taxi-map')!;
    const status = document.querySelector<HTMLElement>('#taxi-map-status')!;
    const map = new AutkMap(canvas, { crs: 'EPSG:3857', showUi: false });
    const features = zoneData.features.filter(feature => selectable.includes(feature.properties.id));
    const zones = new Map(zoneData.features.map(feature => [feature.properties.id, feature.properties]));
    let active: number[] = [];
    let hasLinks = false;
    let compactView = cityOnly;
    const frame = (compact: boolean) => {
        const lower = compact ? [-74.02, 40.697] : [-74.05, 40.625];
        const upper = compact ? [-73.95, 40.797] : [-73.73, 40.805];
        const [x0, y0] = lonLatToCrs(map.workspaceCrs, lower[0], lower[1]);
        const [x1, y1] = lonLatToCrs(map.workspaceCrs, upper[0], upper[1]);
        map.fitBounds([x0, y0, x1, y1]);
    };
    try {
        await map.init();
        map.loadCollection('city', { collection: { ...zoneData, features: zoneData.features.filter(feature => !features.includes(feature)) }, sourceCrs: 'EPSG:4326' });
        map.updateRenderInfo('city', { opacity: 0.29, showBorders: true });
        map.loadCollection('choices', { collection: { ...zoneData, features }, sourceCrs: 'EPSG:4326' });
        map.updateRenderInfo('choices', { isClick: true, showBorders: true });
        frame(compactView);
        map.draw();
        status.textContent = 'Double-click a taxi zone';
    } catch {
        status.textContent = 'Map unavailable. Use the zone selectors.';
        canvas.hidden = true;
        map.destroy();
        return undefined;
    }
    map.events.on(MapEvent.CLICK, ({ layerId, selection }) => {
        if (layerId !== 'choices') return;
        const changed = selection.length ? selection.find(i => !active.includes(i)) ?? active.find(i => !selection.includes(i)) : undefined;
        if (changed !== undefined && features[changed]) pick(features[changed].properties.id);
        map.setSelection('choices', active);
    });
    return {
        show(pickups: number[], destination: number, routeColors?: {
            labels: readonly string[]; colorMap: import('@urban-toolkit/autk-core').ColorMapOptions;
        }) {
            active = features.flatMap(({ properties }, i) => pickups.includes(properties.id) || properties.id === destination ? [i] : []);
            if (hasLinks) map.removeLayer('links');
            const links: FeatureCollection<LineString> = { type: 'FeatureCollection', features: pickups.map((id, i) => ({
                type: 'Feature', geometry: { type: 'LineString', coordinates: [zones.get(id)!.center, zones.get(destination)!.center] },
                properties: routeColors ? { route: routeColors.labels[i] } : {},
            })) };
            map.loadCollection('links', { collection: links, type: 'polylines', sourceCrs: 'EPSG:4326' });
            const compact = cityOnly && !pickups.some(id => airports.includes(id));
            if (compact !== compactView) {
                frame(compact);
                compactView = compact;
            }
            if (routeColors) {
                map.updateColorMap('links', { colorMap: routeColors.colorMap });
                map.updateThematic('links', { collection: links, property: 'properties.route' });
                map.updateRenderInfo('links', { isColorMap: true, opacity: 1, polylinesWidth: 220 });
            } else {
                map.updateRenderInfo('links', { color: { r: 173, g: 0, b: 92, alpha: 1 }, opacity: 1, polylinesWidth: compact ? 45 : 100 });
            }
            hasLinks = true;
            map.setSelection('choices', active);
        },
        destroy: () => map.destroy(),
    };
}
