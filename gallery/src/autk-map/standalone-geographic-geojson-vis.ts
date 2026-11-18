import { AutkMap } from '@urban-toolkit/autk-map';
import { lonLatToCrs } from '@urban-toolkit/autk-core';
import { exampleChoices, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const CENTER = { latitude: 41.855, longitude: -87.665 };

/** A projected workspace and a geographic one, described in the side panel. */
const SYSTEMS = {
    'EPSG:3395': { name: 'World Mercator', code: '3395', projection: 'Mercator', units: 'metres', axes: 'easting, northing' },
    'EPSG:3857': { name: 'Web Mercator', code: '3857', projection: 'Spherical Mercator', units: 'metres', axes: 'easting, northing' },
} as const;

function describe(crs: keyof typeof SYSTEMS): void {
    const system = SYSTEMS[crs];
    const [x, y] = lonLatToCrs(crs, CENTER.longitude, CENTER.latitude);
    const text = (id: string, value: string) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    text('crs-name', system.name);
    text('crs-code', `EPSG:${system.code}`);
    text('crs-projection', system.projection);
    text('crs-units', system.units);
    text('crs-axes', system.axes);
    text('crs-center-x', x.toFixed(2));
    text('crs-center-y', y.toFixed(2));
    text('crs-status', `Geographic center ${CENTER.latitude.toFixed(3)}, ${CENTER.longitude.toFixed(3)} (WGS 84)`);
}

async function main(): Promise<void> {
    // The data is always longitude/latitude; these buttons choose the projected workspace.
    const crs = exampleChoices('Projected CRS', { 'EPSG:3395': 'EPSG:3395', 'EPSG:3857': 'EPSG:3857' }, 'crs') as keyof typeof SYSTEMS;
    describe(crs);

    // The collection is always longitude/latitude; only the workspace CRS changes.
    const response = await fetch(`${BASE_URL}data/chi-community-areas.geojson`);
    if (!response.ok) throw new Error(`Could not load community areas: HTTP ${response.status}`);
    const collection = await response.json();

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!, { crs, showUi: false });
    onExampleDispose(() => map.destroy());
    await map.init();
    map.setView({ center: CENTER, zoom: 11 });
    map.loadCollection('community-areas', { collection, sourceCrs: 'EPSG:4326' });
    map.draw();
}
void runExample(main);
