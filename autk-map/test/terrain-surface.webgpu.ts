import { AutkMap } from '../src/map';
import type { TerrainMapRenderPath } from '../src/map-terrain';
import type { Triangles2DLayer } from '../src/layer-triangles2D';

/** Reads real rendered pixels to distinguish the original polygon mesh from a terrain rectangle. */
export async function runWebGpuCases() {
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:128px;height:128px'; document.body.append(canvas);
    const map = new AutkMap(canvas, false);
    let pixels: GPUBuffer | undefined;
    let restoreCreateBuffer: (() => void) | undefined;
    const nativeFetch = window.fetch;
    try {
        await map.init(); map.renderer.resize(128, 128, 1);
        const device = map.renderer.device, errors: string[] = [];
        let surfaceBuffers = 0;
        const createBuffer = device.createBuffer;
        device.createBuffer = function (descriptor) {
            if (descriptor.label === 'Terrain surface geometry') surfaceBuffers++;
            return createBuffer.call(this, descriptor);
        };
        restoreCreateBuffer = () => { device.createBuffer = createBuffer; };
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        device.pushErrorScope('validation');
        map.style.setCustomStyle({ surface: '#dd6633', background: '#112244', water: '#336699', parks: '#559955',
            roads: '#eeeeee', buildings: '#aaaaaa', points: '#555555', polylines: '#777777', polygons: '#999999' });
        map.loadCollection('surface', { type: 'surface', collection: { type: 'FeatureCollection', features: [{
            type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
                [[-400, -400], [400, -400], [400, 0], [200, 0], [200, 400], [-400, 400], [-400, -400]],
                [[-100, -100], [-100, 100], [100, 100], [100, -100], [-100, -100]],
            ] },
        }] } });
        const surface = map.layerManager.searchByLayerId('surface') as Triangles2DLayer;
        const originalPosition = surface.position.slice(), originalIndices = surface.indices.slice();
        map.loadTerrain({ source: { collection: { type: 'FeatureCollection', bbox: [-1000, -1000, 1000, 1000], features: [{
            type: 'Feature', geometry: null, properties: { rasterResX: 3, rasterResY: 3, height: [10, 20, 10, 20, 30, 20, 10, 20, 10] },
        }] }, property: 'height' }, overlaySize: 128 });
        map.camera.setOrthographicBounds(-600, 600, -600, 600);
        pixels = device.createBuffer({ size: 128 * 512, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const path = () => (map as unknown as { _terrainRenderPath: TerrainMapRenderPath })._terrainRenderPath;
        const capture = async () => {
            const finish = map.renderer.finish.bind(map.renderer);
            map.renderer.finish = () => {
                map.renderer.commandEncoder.copyTextureToBuffer({ texture: canvas.getContext('webgpu')!.getCurrentTexture() }, { buffer: pixels!, bytesPerRow: 512 }, [128, 128]);
                finish();
            };
            try { map.camera.update(); path().renderFrame(); } finally { map.renderer.finish = finish; }
            await pixels!.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(pixels!.getMappedRange()).slice(); pixels!.unmap();
            return (x: number, y: number) => {
                const i = (Math.floor((600 - y) / 1200 * 128) * 128 + Math.floor((x + 600) / 1200 * 128)) * 4;
                const offset = map.renderer.canvasFormat.startsWith('bgra') ? 2 : 0;
                return [bytes[i + offset], bytes[i + 1], bytes[i + 2 - offset]];
            };
        };
        const isBackground = (color: number[]) => Math.abs(color[0] - 17) < 3 && Math.abs(color[1] - 34) < 3 && Math.abs(color[2] - 68) < 3;
        const bare = await capture();
        assert(surfaceBuffers === 3, 'Initial surface should allocate its three mesh buffers once');
        await capture();
        assert(surfaceBuffers === 3, 'Unchanged surface geometry must reuse GPU buffers across frames');
        assert(isBackground(bare(0, 0)), `Polygon hole filled with terrain: ${bare(0, 0)}`);
        assert(isBackground(bare(300, 300)), 'Coastline notch filled with terrain');
        assert(isBackground(bare(-500, 0)), 'Terrain extends beyond the original surface');
        assert(bare(-300, 0)[0] > bare(-300, 0)[2] + 50, 'Surface terrain is missing');
        map.setSkippedIds('surface', [0]);
        assert(isBackground((await capture())(-300, 0)), 'Skipping a surface feature must invalidate its cached mesh');
        assert(surfaceBuffers === 6, 'A changed skip mask should rebuild the surface exactly once');
        map.clearSkippedIds('surface');
        assert((await capture())(-300, 0)[0] > 100, 'Clearing skipped features must restore surface terrain');
        assert(surfaceBuffers === 9, 'Restoring skipped features should rebuild the surface exactly once');
        await capture();
        assert(surfaceBuffers === 9, 'Restored surface geometry must be cached again');

        // Imagery keeps the larger terrain region, with no origin or camera changes.
        const image = new OffscreenCanvas(16, 16), context = image.getContext('2d')!;
        context.fillStyle = '#308040'; context.fillRect(0, 0, 16, 16);
        const blob = await image.convertToBlob();
        window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith('https://imagery.test/')
            ? Promise.resolve(new Response(blob)) : nativeFetch(input, init)) as typeof fetch;
        map.loadTiles('imagery', { source: { urlTemplate: 'https://imagery.test/{z}/{x}/{y}.png', tileSize: 16, maxZoom: 15, attribution: 'Synthetic imagery' } });
        const start = performance.now();
        while (!map.getTileStats('imagery')?.idle) {
            await capture(); assert(performance.now() - start < 20000, 'Imagery did not settle');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        const imagery = await capture();
        assert(!isBackground(imagery(0, 0)) && !isBackground(imagery(300, 300)) && !isBackground(imagery(-500, 0)), 'Imagery lost its larger terrain region');
        map.updateRenderInfo('imagery', { isSkip: true });
        const hidden = await capture();
        assert(isBackground(hidden(0, 0)) && isBackground(hidden(300, 300)), 'Hiding imagery did not restore the surface geometry');
        map.removeLayer('imagery');
        map.updateRenderInfo('surface', { isSkip: true });
        assert(isBackground((await capture())(-300, 0)), 'Hiding the base surface created fallback ground');
        map.updateRenderInfo('surface', { isSkip: false });
        assert((await capture())(-300, 0)[0] > 100, 'Restoring the surface did not restore terrain');
        assert(surface.position.every((value, i) => value === originalPosition[i]) && surface.indices.every((value, i) => value === originalIndices[i]), 'The original surface layer geometry was modified');
        map.camera.resetCamera([0, 1, 0], [0, 0, 0], [0, -800, 900]);
        await capture();
        const error = await device.popErrorScope(); if (error) errors.push(error.message);
        assert(!errors.length, errors.join('\n'));
        return { status: 'passed', checks: ['original coastline and holes in real terrain pixels', 'unchanged surface reuses its mesh and GPU buffers', 'larger terrain with imagery; original surface without imagery', 'surface visibility, geometry preservation, tilt, and GPU validation'] };
    } finally { restoreCreateBuffer?.(); window.fetch = nativeFetch; pixels?.destroy(); map.destroy(); canvas.remove(); }
}
