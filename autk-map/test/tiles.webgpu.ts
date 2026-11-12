import type { FeatureCollection } from 'geojson';
import { AutkMap } from '../src/map';
import type { TileLayer } from '../src/layer-tiles';
import type { Layer } from '../src/layer';
import { tileLonLatBounds } from '../src/tile-index';
import { lonLatToCrs, type TileCrs } from '../src/tile-projection';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';
import type { Triangles3DLayer } from '../src/layer-triangles3D';

/** Native fetch/decode/upload, production tile shaders, and pixel readback without a provider. */
export async function runWebGpuCases() {
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const checks: string[] = [];
    async function bitmapBlob(transparent: boolean) {
        const image = new OffscreenCanvas(64, 64);
        const context = image.getContext('2d')!;
        context.fillStyle = '#ff0000'; context.fillRect(0, 0, 32, 32);
        context.fillStyle = '#00ff00'; context.fillRect(32, 0, 32, 32);
        context.fillStyle = '#0000ff'; context.fillRect(0, 32, 32, 32);
        if (!transparent) { context.fillStyle = '#ffffff'; context.fillRect(32, 32, 32, 32); }
        return image.convertToBlob({ type: 'image/png' });
    }
    const parentImage = await bitmapBlob(false);
    const childImage = await bitmapBlob(true);
    const nativeFetch = window.fetch;
    const target = { z: 4, x: 8, y: 8 };
    for (const crs of ['EPSG:3857', 'EPSG:3395', 'EPSG:4326'] as TileCrs[]) {
        let allowChildren = false;
        let requests = 0;
        const waiting: Array<() => void> = [];
        window.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
            const url = String(input);
            if (!url.startsWith('https://autark-tiles.test/')) return nativeFetch(input, options);
            requests++;
            const z = Number(new URL(url).pathname.split('/')[1]);
            if (z < target.z || allowChildren) return Promise.resolve(new Response(z < target.z ? parentImage : childImage));
            return new Promise<Response>((resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
                waiting.push(() => resolve(new Response(childImage)));
            });
        }) as typeof fetch;
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:128px;height:128px';
        document.body.append(canvas);
        const map = new AutkMap(canvas, false);
        const resources: Array<{ destroy(): void }> = [];
        try {
            await map.init();
            const renderer = map.renderer;
            renderer.resize(128, 128, 1);
            const device = renderer.device;
            device.pushErrorScope('validation');
            const errors: string[] = [];
            device.addEventListener('uncapturederror', event => errors.push(event.error.message));
            const bounds = tileLonLatBounds(target);
            const [west, south] = lonLatToCrs(crs, bounds.west, bounds.south);
            const [east, north] = lonLatToCrs(crs, bounds.east, bounds.north);
            const polygon: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
                geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } }] };
            map.loadCollection('overlay', { collection: polygon, type: 'polygons' });
            const origin = map.layerManager.origin;
            const cx = (west + east) / 2 - origin[0], cy = (south + north) / 2 - origin[1];
            const distance = Math.max(east - west, north - south) / (2 * Math.tan(map.camera.getFovyRadians() / 2));
            map.camera.resetCamera([0, 1, 0], [cx, cy, 0], [cx, cy, distance], Math.max(500000, distance * 2));
            map.camera.resize(128, 128);
            map.loadTiles('tiles', { source: { urlTemplate: 'https://autark-tiles.test/{z}/{x}/{y}.png', attribution: 'Synthetic tiles',
                minZoom: 3, maxZoom: 4 }, ...(crs === 'EPSG:3395' ? {} : { crs }), zoomBias: 1 });
            const tiles = map.layerManager.searchByLayerId('tiles') as TileLayer;
            const overlay = map.layerManager.searchByLayerId('overlay')!;
            const texture = (format: GPUTextureFormat, samples: number, copy = false) => {
                const result = device.createTexture({ size: [128, 128], format, sampleCount: samples,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | (copy ? GPUTextureUsage.COPY_SRC : 0) });
                resources.push(result); return result;
            };
            const output = texture(renderer.canvasFormat, 1, true);
            const color = texture(renderer.canvasFormat, renderer.sampleCount);
            const depth = texture('depth32float', renderer.sampleCount);
            const readback = device.createBuffer({ size: 128 * 512, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            resources.push(readback);
            async function waitFor(test: () => boolean) {
                const start = performance.now();
                while (!test()) {
                    tiles.prepareRender(map.camera);
                    if (performance.now() - start > 10000) throw new Error(`${crs}: tile loading timed out: ${JSON.stringify(tiles.stats)}`);
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                tiles.prepareRender(map.camera);
            }
            async function pixels(layers: Layer[] = [tiles], buildings: Triangles3DLayer[] = []) {
                tiles.prepareRender(map.camera);
                renderer.start();
                if (buildings.length) {
                    const geometry = PipelineBuildingSSAO.beginSharedGeometryPass(renderer);
                    buildings.forEach(building => building.renderSceneGeometry(map.camera, geometry)); geometry.end();
                }
                const pass = renderer.commandEncoder.beginRenderPass({
                    colorAttachments: [{ view: color.createView(), resolveTarget: output.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
                    depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 0 },
                });
                layers.forEach(layer => layer.renderPass(map.camera, pass));
                if (buildings.length) PipelineBuildingSSAO.compositeSharedPass(renderer, pass);
                pass.end();
                renderer.commandEncoder.copyTextureToBuffer({ texture: output }, { buffer: readback, bytesPerRow: 512 }, [128, 128]);
                renderer.finish();
                await readback.mapAsync(GPUMapMode.READ);
                const bytes = new Uint8Array(readback.getMappedRange()).slice(); readback.unmap(); return bytes;
            }
            const rgba = (bytes: Uint8Array, x: number, y: number) => {
                const i = (y * 128 + x) * 4;
                return renderer.canvasFormat.startsWith('bgra') ? [bytes[i + 2], bytes[i + 1], bytes[i], bytes[i + 3]] : [...bytes.slice(i, i + 4)];
            };
            const near = (bytes: Uint8Array, x: number, y: number, expected: number[], label: string) => {
                const actual = rgba(bytes, x, y);
                assert(actual.every((n, i) => Math.abs(n - expected[i]) <= 4), `${crs}: ${label}: ${actual} != ${expected}`);
            };
            await waitFor(() => tiles.stats.fallbackTiles > 0);
            near(await pixels(), 96, 96, [255, 0, 0, 255], 'ancestor crop');
            allowChildren = true; waiting.splice(0).forEach(resolve => resolve());
            await waitFor(() => tiles.stats.missingTiles === 0 && tiles.stats.fallbackTiles === 0 && tiles.stats.readyTiles > 0);
            const ready = await pixels();
            near(ready, 32, 32, [255, 0, 0, 255], 'northwest');
            near(ready, 96, 32, [0, 255, 0, 255], 'northeast');
            near(ready, 32, 96, [0, 0, 255, 255], 'southwest');
            near(ready, 96, 96, [0, 0, 0, 0], 'transparent southeast');
            checks.push(`${crs}: native texture upload, orientation, parent UV crop, and transparency (3395 uses default CRS)`);
            tiles.updateLayerInfo({ zIndex: 1000000 });
            const reordered = await pixels();
            assert(ready.every((n, i) => n === reordered[i]), `${crs}: order metadata changed geometry`);
            map.updateRenderInfo('tiles', { opacity: 0.5 });
            near(await pixels(), 32, 32, [128, 0, 0, 128], 'premultiplied opacity');
            map.updateRenderInfo('tiles', { opacity: 1 });
            map.updateRenderInfo('overlay', { color: { r: 255, g: 255, b: 0, alpha: 1 } });
            near(await pixels([tiles, overlay]), 32, 32, [255, 255, 0, 255], 'vector overlay ordering');
            checks.push(`${crs}: no physical z-index, opacity, and vector overlay order`);
            if (crs === 'EPSG:3857') {
                map.camera.resetCamera([0, 1, 0], [cx, cy, 0], [cx, cy, distance * 2], Math.max(500000, distance * 4));
                map.camera.resize(128, 128);
                await waitFor(() => tiles.stats.zoom === 3 && tiles.stats.missingTiles === 0 && tiles.stats.fallbackTiles === 0);
                const adjacent = await pixels();
                for (const x of [30, 31, 32, 33]) assert(rgba(adjacent, x, 64)[3] === 255, 'Adjacent opaque tiles leave a seam');
                map.camera.resetCamera([0, 1, 0], [cx, cy, 0], [cx, cy, distance], Math.max(500000, distance * 2));
                map.camera.resize(128, 128);
                await waitFor(() => tiles.stats.zoom === 4 && tiles.stats.missingTiles === 0 && tiles.stats.fallbackTiles === 0);
                checks.push('adjacent tile edge coverage through a zoom transition');
                const roofHeight = distance / 100;
                map.loadMesh('roof', { geometry: [{
                    position: new Float32Array([west - origin[0], south - origin[1], roofHeight, east - origin[0], south - origin[1], roofHeight,
                        east - origin[0], north - origin[1], roofHeight, west - origin[0], north - origin[1], roofHeight]),
                    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
                }], components: [{ nPoints: 4, nTriangles: 2, featureIndex: 0 }], type: 'buildings' });
                map.updateRenderInfo('roof', { color: { r: 255, g: 255, b: 0, alpha: 1 } });
                const building = map.layerManager.searchByLayerId('roof') as Triangles3DLayer;
                const roof = rgba(await pixels([tiles], [building]), 64, 64);
                assert(roof[0] > 80 && roof[1] > 80 && roof[2] < 5, 'Physical building composite must cover tiles');
                checks.push('physical building depth and composition over imagery');
                map.removeLayer('roof');
            }
            map.removeLayer('overlay');
            // The origin remains established after removing the data layer.
            map.draw({ onDemand: true });
            await new Promise(resolve => setTimeout(resolve, 150));
            const frames = map.renderStats.frameCount;
            await new Promise(resolve => setTimeout(resolve, 150));
            assert(map.renderStats.frameCount === frames, 'Tile statistics or ready tiles keep rendering');
            const loaded = requests;
            map.updateRenderInfo('tiles', { isSkip: true });
            await new Promise(resolve => setTimeout(resolve, 30));
            assert(requests === loaded && tiles.stats.idle, 'Hidden tiles keep loading');
            map.updateRenderInfo('tiles', { isSkip: false });
            await new Promise(resolve => setTimeout(resolve, 50));
            assert(requests === loaded, 'Showing cached tiles should not refetch');
            map.removeLayer('tiles');
            assert(tiles.stats.cachedTextures === 0 && map.getTileStats('tiles') === null, 'Removed layer keeps tile resources');
            checks.push(`${crs}: idle rendering, hide/show cache reuse, and removal`);
            const validation = await device.popErrorScope();
            if (validation) errors.push(validation.message);
            assert(errors.length === 0, errors.join('\n'));
        } finally {
            map.destroy(); resources.forEach(resource => resource.destroy()); canvas.remove(); window.fetch = nativeFetch;
        }
    }
    return { status: 'passed', checks };
}
