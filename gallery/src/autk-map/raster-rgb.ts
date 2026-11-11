import { runExample } from '../example';
import type { FeatureCollection, Geometry } from 'geojson';
import { AutkMap, type RasterRgbBands } from '@urban-toolkit/autk-map';

const WIDTH = 96;
const HEIGHT = 64;
const RGB: RasterRgbBands = ['red', 'green', 'blue'];

/** Local test imagery: four colors, a no-data hole, and an optional invisible outlier. */
function imagery(scale = 1, maskedOutlier = false): FeatureCollection<Geometry | null> {
    const red = new Float32Array(WIDTH * HEIGHT);
    const green = new Float32Array(red.length);
    const blue = new Float32Array(red.length);
    const scalar = new Float32Array(red.length);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const i = y * WIDTH + x;
            const right = x >= WIDTH / 2;
            const top = y >= HEIGHT / 2;
            red[i] = ((!right && !top) || (right && top) ? 255 : 0) * scale;
            green[i] = (right ? 255 : 0) * scale;
            blue[i] = (top ? 255 : 0) * scale;
            scalar[i] = x + y;
            if (Math.abs(x - WIDTH / 2) < 7 && Math.abs(y - HEIGHT / 2) < 7) {
                red[i] = NaN;
                green[i] = maskedOutlier ? 1_000_000 : NaN;
                blue[i] = maskedOutlier ? 1_000_000 : NaN;
                scalar[i] = NaN;
            }
        }
    }
    return { type: 'FeatureCollection', bbox: [300000, 700000, 300960, 700640], features: [{
        type: 'Feature', geometry: null, properties: { rasterResX: WIDTH, rasterResY: HEIGHT, red, green, blue, scalar },
    }] };
}

async function main(): Promise<void> {
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    map.style.setCustomStyle({ background: '#e3e8ee', surface: '#eee', parks: '#cfc', water: '#bdf',
        roads: '#ddd', buildings: '#ccc', points: '#555', polylines: '#777', polygons: '#999' });
    const status = document.querySelector<HTMLElement>('#status')!;
    await map.init();
    const collection = imagery();
    let scalarShown = false;
    map.loadCollection('imagery', { collection, type: 'raster', property: RGB });
    map.fitBounds();
    map.draw();
    const describe = (message: string) => {
        const layer = map.layerManager.searchByLayerId('imagery')!;
        status.textContent = `${message} · origin ${map.layerManager.origin.join(', ')} · scalar legend ${layer.layerRenderInfo.isColorMap ? 'on' : 'off'}`;
    };
    const button = (id: string, action: () => void) => document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', action);
    button('rgb', () => { map.updateRaster('imagery', { collection, property: RGB }); describe('RGB bytes'); });
    button('reflectance', () => {
        map.updateRaster('imagery', { collection: imagery(10, true), property: RGB });
        describe('Automatic stretch ignores the transparent outlier');
    });
    button('normalized', () => {
        map.updateRaster('imagery', { collection: imagery(1 / 255), property: RGB, rgbRange: [0, 1] });
        describe('Normalized RGB with explicit range');
    });
    button('scalar', () => {
        map.updateRaster('imagery', { collection, property: 'scalar', transferFunction: { mode: 'linear' } });
        if (!scalarShown) map.updateRenderInfo('imagery', { isColorMap: true });
        scalarShown = true;
        describe('Scalar ramp');
    });
    button('invalid-size', () => {
        const invalid = { ...collection, features: [{ ...collection.features[0], properties: { red: [255], green: [0], blue: [0] } }] };
        map.updateRaster('imagery', { collection: invalid, property: RGB });
        describe('Wrong dimensions rejected; image and mode preserved');
    });
    button('invalid-range', () => {
        map.updateRaster('imagery', { collection, property: RGB, rgbRange: [255, 0] });
        describe('Invalid range rejected; image and mode preserved');
    });
    button('fit', () => { map.resetCamera(); describe('Fitted view restored'); });
    document.querySelector<HTMLInputElement>('#opacity')!.addEventListener('input', event => {
        map.updateRenderInfo('imagery', { opacity: Number((event.target as HTMLInputElement).value) });
    });
    describe('RGB bytes');
}

void runExample(main);
