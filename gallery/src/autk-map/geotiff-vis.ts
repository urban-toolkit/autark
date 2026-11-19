import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';
import { CORINE_PALETTE } from './corine-palette';

const BASE_URL = import.meta.env.BASE_URL;
const rasterOpacity = { population: 0.78, land_cover: 0.78 };
// WGS84 bounds of the bundled WorldPop crop, snapped to its pixel edges.
const BBOX: [number, number, number, number] = [-9.240416615, 38.669583380, -9.039583283, 38.820416713];

async function main(): Promise<void> {
    const corine = exampleVariant('Raster', { population: 'Lisbon population', rgb: 'Lisbon land cover (CORINE)' }) === 'rgb';
    const layerId = corine ? 'land_cover' : 'population';
    const slider = document.querySelector<HTMLInputElement>('#raster-opacity')!;
    const output = document.querySelector<HTMLOutputElement>('#raster-opacity-value')!;
    slider.valueAsNumber = rasterOpacity[layerId];
    output.value = `${Math.round(rasterOpacity[layerId] * 100)}%`;
    slider.setAttribute('aria-valuetext', output.value);
    document.querySelector('#map-title')!.textContent = corine ? 'Lisbon land cover, 2018' : 'Lisbon population, 2020';
    document.querySelector('#map-help')!.textContent = corine
        ? 'CORINE Land Cover 2018 · Published RGB colors decoded into land-cover classes'
        : 'Estimated people per grid cell · Darker red means more residents';

    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lisbon.osm.pbf`,
        queryArea: { bbox: BBOX },
        autoLoadLayers: { layers: ['surface', 'water', 'roads'] },
    });
    await db.loadGeoTiff({
        geotiffFileUrl: `${BASE_URL}data/${corine ? 'lisbon-corine-2018-rgb.tif' : 'lisbon-population-2020.tif'}`,
        coordinateFormat: 'EPSG:4326',
        outputTableName: layerId,
        ...(corine ? { resampleMethod: 'nearest' } : {}),
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    map.style.setPredefinedStyle('light');
    await map.init();
    map.loadCollection(layerId, {
        collection: await db.getRaster(layerId),
        type: 'raster',
        property: corine ? ['band_1', 'band_2', 'band_3'] : 'band_1',
    });
    map.updateColorMap(layerId, { colorMap: corine ? CORINE_PALETTE : {
        interpolator: ColorMapInterpolator.SEQ_YL_OR_RD,
        domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [0, 98] },
    } });
    map.updateRenderInfo(layerId, { isColorMap: true });
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
    }
    map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);

    const updateOpacity = () => {
        const opacity = slider.valueAsNumber;
        rasterOpacity[layerId] = opacity;
        output.value = `${Math.round(opacity * 100)}%`;
        slider.setAttribute('aria-valuetext', output.value);
        map.updateRenderInfo(layerId, { opacity });
    };
    updateOpacity();
    slider.addEventListener('input', updateOpacity);
    onExampleDispose(() => {
        slider.removeEventListener('input', updateOpacity);
        slider.disabled = true;
    });
    slider.disabled = false;
    map.fitBounds();
    map.draw();
}
void runExample(main);
