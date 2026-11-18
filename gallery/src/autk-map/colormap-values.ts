import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;

/** Berlin boroughs in the official 01–12 order used by the categorical legend. */
const BERLIN_BEZIRKE = [
    'Mitte',
    'Friedrichshain-Kreuzberg',
    'Pankow',
    'Charlottenburg-Wilmersdorf',
    'Spandau',
    'Steglitz-Zehlendorf',
    'Tempelhof-Schöneberg',
    'Neukölln',
    'Treptow-Köpenick',
    'Marzahn-Hellersdorf',
    'Lichtenberg',
    'Reinickendorf',
];

async function main(): Promise<void> {
    const variant = exampleVariant('Coloring', {
        category: 'By borough (category)',
        sequential: 'By area (white–blue)',
        diverging: 'By area (red–blue)',
    });

    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/berlin-ortsteile.geojson`, outputTableName: 'ortsteile' });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!, { showUi: false });
    onExampleDispose(() => map.destroy());
    await map.init();

    const ortsteile = await db.getLayer('ortsteile');
    map.loadCollection('ortsteile', { collection: ortsteile });

    if (variant === 'category') {
        map.updateColorMap('ortsteile', { colorMap: {
            interpolator: ColorMapInterpolator.CAT_PAIRED,
            domainSpec: { type: ColorMapDomainStrategy.USER, params: BERLIN_BEZIRKE },
        } });
        map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.bezirk' });
    } else {
        map.updateColorMap('ortsteile', { colorMap: {
            interpolator: variant === 'diverging' ? ColorMapInterpolator.DIV_RED_BLUE : ColorMapInterpolator.SEQ_BLUES,
            domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },
        } });
        map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.area_km2' });
    }

    map.updateRenderInfo('ortsteile', { isColorMap: true });
    map.fitBounds();
    map.draw();
}
void runExample(main);
