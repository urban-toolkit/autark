import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const db = new AutkDb();
let databaseReady = false;

/**
 * All three files live in one workspace. The boroughs cover the whole area, so they are
 * imported first: the first vector table sets the workspace extent that every later
 * import is clipped to, which keeps all layers on the same ground.
 */
async function load(): Promise<void> {
    if (!databaseReady) { await db.init(); databaseReady = true; }
    await db.setWorkspace('london');

    const loaded = new Set(db.getTablesMetadata().map(table => table.name));
    if (!loaded.has('boroughs')) {
        await db.loadCsv({
            csvFileUrl: `${BASE_URL}data/london-boroughs.csv`,
            outputTableName: 'boroughs',
            geometryColumns: { wktColumnName: 'wkt' },
        });
    }
    if (!loaded.has('tube_lines')) {
        await db.loadJson({
            jsonFileUrl: `${BASE_URL}data/london-tube-lines.json`,
            outputTableName: 'tube_lines',
            geometryColumns: { wktColumnName: 'wkt' },
        });
    }
    if (!loaded.has('tube_entrances')) {
        await db.loadCsv({
            csvFileUrl: `${BASE_URL}data/london-tube-entrances.csv`,
            outputTableName: 'tube_entrances',
            geometryColumns: { latColumnName: 'lat', longColumnName: 'lon' },
        });
    }
}

async function main(): Promise<void> {
    await load();

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();

    // Load order is draw order: boroughs first, then lines, then entrances on top.
    map.loadCollection('boroughs', { collection: await db.getLayer('boroughs'), type: 'polygons' });
    map.updateRenderInfo('boroughs', { opacity: 0.25, showBorders: true });

    const tubeLines = await db.getLayer('tube_lines');
    map.loadCollection('tube_lines', { collection: tubeLines, type: 'polylines' });
    map.updateRenderInfo('tube_lines', { polylinesWidth: 900, isColorMap: true });
    // One color per line: the categorical domain comes from the line names.
    map.updateColorMap('tube_lines', { colorMap: { interpolator: ColorMapInterpolator.CAT_PAIRED } });
    map.updateThematic('tube_lines', { collection: tubeLines, property: 'properties.name' });

    const entrances = await db.getLayer('tube_entrances');
    for (const feature of entrances.features) feature.properties!.wheelchair ||= 'unmapped';
    map.loadCollection('tube_entrances', { collection: entrances, type: 'points' });
    map.updateRenderInfo('tube_entrances', { pointSize: 450 });
    map.updateColorMap('tube_entrances', { colorMap: {
        interpolator: ColorMapInterpolator.CAT_SET1,
        domainSpec: { type: ColorMapDomainStrategy.USER, params: ['no', 'limited', 'yes', 'unmapped'] },
    } });
    map.updateThematic('tube_entrances', { collection: entrances, property: 'properties.wheelchair' });

    map.fitBounds();
    map.draw();
}
void runExample(main);
