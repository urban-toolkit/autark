import { AutkMap } from '../src/map';
import type { Triangles3DLayer } from '../src/layer-triangles3D';
import type { TileHeightSource } from '../src/height-source-tiles';
import type { TerrainMapRenderPath } from '../src/map-terrain';
import heightLookup from '../src/shaders/height-lookup.wgsl';

/** Native DEM decoding, streamed GPU updates, complete terrain rendering, and picking. */
async function runTerrainCases(pixelRatio: number) {
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const nativeFetch = window.fetch;
    const checks: string[] = [];
    let allowDem = false;
    let elevation = 40;
    const waiting: Array<() => void> = [];
    async function imageBlob(height?: number) {
        const canvas = new OffscreenCanvas(16, 16);
        const context = canvas.getContext('2d')!;
        const value = (height ?? 0) + 32768;
        context.fillStyle = height === undefined ? '#308040' : `rgb(${Math.floor(value / 256)},${value % 256},0)`;
        context.fillRect(0, 0, 16, 16);
        return canvas.convertToBlob({ type: 'image/png' });
    }
    const imagery = await imageBlob();
    const dem = new Map([[40, await imageBlob(40)], [90, await imageBlob(90)]]);
    window.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('https://imagery.test/')) return Promise.resolve(new Response(imagery));
        if (!url.startsWith('https://dem.test/')) return nativeFetch(input, options);
        if (allowDem) return Promise.resolve(new Response(dem.get(elevation)!));
        return new Promise<Response>((resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            waiting.push(() => resolve(new Response(dem.get(elevation)!)));
        });
    }) as typeof fetch;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:128px;height:128px';
    document.body.append(canvas);
    const map = new AutkMap(canvas, false);
    const owned: Array<{ destroy(): void }> = [];
    const source = { urlTemplate: 'https://dem.test/{z}/{x}/{y}.png', encoding: 'terrarium' as const,
        tileSize: 16, minZoom: 9, maxZoom: 14, attribution: 'Synthetic elevation' };
    const options = { source, levels: 3, windowSize: 16, overlaySize: 128 };
    try {
        await map.init();
        map.renderer.resize(128, 128, pixelRatio);
        const device = map.renderer.device;
        const errors: string[] = [];
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        device.pushErrorScope('validation');
        map.loadTerrain({ ...options, center: { latitude: 0, longitude: 0 }, zoom: 15 });
        assert(map.layerManager.layers.length === 0, 'Terrain-only initialization created an imagery layer');
        const path = () => (map as unknown as { _terrainRenderPath: TerrainMapRenderPath })._terrainRenderPath;
        const heights = () => (path() as unknown as { heightSource: TileHeightSource }).heightSource;
        const render = async () => { map.camera.update(); path().renderFrame(); await device.queue.onSubmittedWorkDone(); await new Promise(resolve => setTimeout(resolve, 10)); };
        const wait = async (predicate: () => boolean) => {
            const start = performance.now();
            while (!predicate()) { if (performance.now() - start > 20000) throw new Error('Terrain test timed out'); await render(); }
            await render();
        };
        assert(heights().heightAt(0, 0) === 0, 'Unloaded terrain must start at the fallback height');
        const selector = (path() as unknown as { terrainRenderer: { selectBlocks(...args: unknown[]): void } }).terrainRenderer;
        const select = selector.selectBlocks;
        let selections = 0;
        selector.selectBlocks = function (...args) { selections++; select.apply(this, args); };
        try { await render(); } finally { selector.selectBlocks = select; }
        assert(selections === 1, `Expected one LOD/seam selection per frame, received ${selections}`);
        checks.push('one terrain LOD and seam selection per frame');
        allowDem = true;
        waiting.splice(0).forEach(resolve => resolve());
        await wait(() => !!map.getTerrainTileStats()?.complete);
        assert(Math.abs(heights().heightAt(0, 0) - 40) < 0.01, 'DEM did not update CPU heights');

        // Read the renderer's actual uploaded height texture through the production lookup shader.
        const terrain = () => (path() as unknown as { terrainRenderer: { heightTextureView: GPUTextureView; heightUniformBuffer: GPUBuffer } }).terrainRenderer;
        const result = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const readback = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        owned.push(result, readback);
        const module = device.createShaderModule({ code: `${heightLookup}
@group(0) @binding(0) var<uniform> terrainHeights: TerrainHeights;
@group(0) @binding(1) var terrainHeightTexture: texture_2d_array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
@compute @workgroup_size(1) fn main() { output[0] = terrainHeight(vec2<f32>(0.0)); }` });
        const layout = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ] });
        const pipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: 'main' } });
        const uploadedHeight = async () => {
            const group = device.createBindGroup({ layout, entries: [
                { binding: 0, resource: { buffer: terrain().heightUniformBuffer } },
                { binding: 1, resource: terrain().heightTextureView }, { binding: 2, resource: { buffer: result } },
            ] });
            const encoder = device.createCommandEncoder(); const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(1); pass.end();
            encoder.copyBufferToBuffer(result, 0, readback, 0, 4); device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const value = new Float32Array(readback.getMappedRange())[0]!; readback.unmap(); return value;
        };
        assert(Math.abs(await uploadedHeight() - 40) < 0.01, 'Streaming DEM arrival did not update the real GPU texture');
        checks.push('native DEM decode, CPU-to-GPU streaming update, and production height lookup');

        // Capture actual terrain pixels before presentation, including terrain without imagery.
        const pixels = device.createBuffer({ size: 128 * 512, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        owned.push(pixels);
        const capture = async () => {
            const finish = map.renderer.finish.bind(map.renderer);
            map.renderer.finish = () => {
                map.renderer.commandEncoder.copyTextureToBuffer({ texture: canvas.getContext('webgpu')!.getCurrentTexture() }, { buffer: pixels, bytesPerRow: 512 }, [128, 128]);
                finish();
            };
            map.camera.update();
            try { path().renderFrame(); } finally { map.renderer.finish = finish; }
            await pixels.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(pixels.getMappedRange()).slice(); pixels.unmap();
            const centre = (64 * 128 + 64) * 4;
            const offset = map.renderer.canvasFormat.startsWith('bgra') ? 2 : 0;
            return [bytes[centre + offset]!, bytes[centre + 1]!, bytes[centre + 2 - offset]!];
        };
        map.style.setCustomStyle({ surface: '#dd6633', background: '#112244', water: '#336699', parks: '#559955',
            roads: '#eeeeee', buildings: '#aaaaaa', points: '#555555', polylines: '#777777', polygons: '#999999' });
        const bare = await capture();
        assert(bare[0]! > bare[2]! + 30, `Terrain without imagery was invisible: ${bare}`);
        checks.push('terrain-only initialization and shaded surface pixel readback');
        const eyeBeforeImagery = [...map.camera.getEye()];
        map.loadTiles('imagery', {
            source: { urlTemplate: 'https://imagery.test/{z}/{x}/{y}.png', attribution: 'Synthetic imagery', maxZoom: 15 } });
        assert(map.camera.getEye().every((v, i) => v === eyeBeforeImagery[i]), 'Adding imagery reset the terrain view');
        await wait(() => (map.getTileStats('imagery')?.readyTiles ?? 0) > 0 && map.getTileStats('imagery')?.missingTiles === 0);
        const color = await capture();
        assert(color[1]! > color[0]! + 15, `Imagery did not render through the terrain fragment path: ${color}; ${errors}`);
        map.updateRenderInfo('imagery', { isSkip: true });
        const hidden = await capture();
        assert(hidden[0]! > hidden[2]! + 30, 'Hiding imagery also hid terrain');
        map.updateRenderInfo('imagery', { isSkip: false });
        checks.push('independent imagery loading and visibility without changing terrain or camera');

        map.loadMesh('roof', { geometry: [{ position: new Float32Array([-200, -200, 200, 200, -200, 200, 200, 200, 200, -200, 200, 200]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }],
            components: [{ nPoints: 4, nTriangles: 2, featureIndex: 0 }], type: 'buildings' });
        map.updateRenderInfo('roof', { isPick: true, pickedComps: [64, 64] });
        await wait(() => (map.layerManager.searchByLayerId('roof') as Triangles3DLayer).highlightedIds.length > 0);
        checks.push('streamed terrain-aware buildings, composition, and real picking readback');

        const previous = path(); const eye = map.camera.getEye();
        const createTexture = device.createTexture;
        device.createTexture = function (descriptor) {
            if (descriptor.label === 'Terrain height texture array') throw new Error('Synthetic allocation failure');
            return createTexture.call(device, descriptor);
        };
        try { map.loadTerrain({ ...options, overlaySize: 256 }); throw new Error('Failure was not propagated'); }
        catch (error) { assert(String(error).includes('Synthetic allocation failure'), String(error)); }
        finally { device.createTexture = createTexture; }
        assert(path() === previous && map.camera.getEye().every((v, i) => v === eye[i]), 'Failed replacement changed the active terrain or camera');
        await render();
        elevation = 90; map.loadTerrain(options);
        await wait(() => !!map.getTerrainTileStats()?.complete);
        assert(Math.abs(await uploadedHeight() - 90) < 0.01, 'Terrain replacement retained old GPU heights');
        map.removeTerrain();
        assert(map.getTerrainTileStats() === null, 'Terrain disable retained the streaming source');
        checks.push('failed replacement rollback, successful replacement, and terrain disable');
        map.enableTerrainMode({ type: 'FeatureCollection', bbox: [-700.5, -600.25, 700.5, 600.25], features: [{
            type: 'Feature', geometry: null, properties: { rasterResX: 2, rasterResY: 2, band: [80, 80, 80, 80] },
        }] }, 'band');
        await render();
        assert(Math.abs(await uploadedHeight() - 80) < 0.01, 'Existing fixed-heightfield terrain did not reach the shared GPU path');
        assert(map.getTerrainTileStats() === null, 'GeoTIFF terrain must not expose streaming statistics');
        map.removeTerrain();
        checks.push('existing GeoTIFF terrain and nonzero grid origin through the complete GPU path');
        const error = await device.popErrorScope(); if (error) errors.push(error.message);
        assert(errors.length === 0, errors.join('\n'));
        return { status: 'passed', checks: checks.map(check => `DPR ${pixelRatio}: ${check}`) };
    } finally {
        map.destroy(); owned.forEach(resource => resource.destroy()); canvas.remove(); window.fetch = nativeFetch;
    }
}

export async function runWebGpuCases() {
    const checks: string[] = [];
    for (const pixelRatio of [1, 2]) checks.push(...(await runTerrainCases(pixelRatio)).checks);
    return { status: 'passed', checks };
}
