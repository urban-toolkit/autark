import type { FeatureCollection, Geometry } from 'geojson';
import { AutkMap } from '../src/map';
import type { RasterLayer } from '../src/layer-raster';
import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

/** Render real RGB textures, scalar transitions, legends, and rejected updates without external datasets. */
export async function runWebGpuCases() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:128px;height:128px';
    document.body.append(canvas);
    const map = new AutkMap(canvas);
    const resources: Array<{ destroy(): void }> = [];
    const checks: string[] = [];
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const collection = (scale = 1, maskedOutlier = false): FeatureCollection<Geometry | null> => {
        const r: number[] = [], g: number[] = [], b: number[] = [], scalar: number[] = [];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            r.push((x < 2 ? 255 : 0) * scale);
            g.push((x >= 2 ? 255 : 0) * scale);
            b.push((y >= 2 ? 255 : 0) * scale);
            scalar.push(x + y * 4);
        }
        if (maskedOutlier) { r[0] = NaN; g[0] = 1e6; b[0] = 1e6; }
        return { type: 'FeatureCollection', bbox: [300000, 700000, 300010, 700010], features: [{
            type: 'Feature', geometry: null, properties: { rasterResX: 4, rasterResY: 4, r, g, b, scalar },
        }] };
    };
    try {
        await map.init();
        const renderer = map.renderer;
        renderer.resize(128, 128, 1);
        const device = renderer.device;
        device.pushErrorScope('validation');
        const errors: string[] = [];
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        const texture = (format: GPUTextureFormat, samples: number, copy = false) => {
            const result = device.createTexture({ size: [128, 128], format, sampleCount: samples,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | (copy ? GPUTextureUsage.COPY_SRC : 0) });
            resources.push(result);
            return result;
        };
        const output = texture(renderer.canvasFormat, 1, true);
        const color = texture(renderer.canvasFormat, renderer.sampleCount);
        const depth = texture('depth32float', renderer.sampleCount);
        const readback = device.createBuffer({ size: 128 * 512, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        resources.push(readback);
        const source = collection();
        map.loadCollection('image', { collection: source, type: 'raster', property: ['r', 'g', 'b'] });
        map.fitBounds();
        const layer = map.layerManager.searchByLayerId('image') as RasterLayer;
        assert(map.layerManager.origin[0] === 300005 && map.layerManager.origin[1] === 700005, 'Raster origin did not use declared bounds');
        assert(!!map.layerManager.bounds, 'Raster bounds unavailable for fitting');
        async function pixels() {
            renderer.start();
            const pass = renderer.commandEncoder.beginRenderPass({
                colorAttachments: [{ view: color.createView(), resolveTarget: output.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
                depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 0 },
            });
            layer.renderPass(map.camera, pass);
            pass.end();
            renderer.commandEncoder.copyTextureToBuffer({ texture: output }, { buffer: readback, bytesPerRow: 512 }, [128, 128]);
            renderer.finish();
            await readback.mapAsync(GPUMapMode.READ);
            const data = new Uint8Array(readback.getMappedRange()).slice();
            readback.unmap();
            return data;
        }
        const rgba = (data: Uint8Array, x: number, y: number) => {
            const p = Array.from(data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
            return renderer.canvasFormat.startsWith('bgra') ? [p[2], p[1], p[0], p[3]] : p;
        };
        const near = (actual: number[], expected: number[], message: string) => assert(actual.every((n, i) => Math.abs(n - expected[i]) <= 3), `${message}: ${actual}`);
        const same = (a: Uint8Array, b: Uint8Array, message: string) => assert(a.every((v, i) => v === b[i]), message);
        const bytes = await pixels();
        near(rgba(bytes, 34, 94), [255, 0, 0, 255], 'Red quadrant');
        near(rgba(bytes, 94, 94), [0, 255, 0, 255], 'Green quadrant');
        near(rgba(bytes, 34, 34), [255, 0, 255, 255], 'Magenta quadrant');
        checks.push('standalone raster origin, fitting, and true-color pixels');

        map.updateRaster('image', { collection: collection(1 / 255), property: ['r', 'g', 'b'], rgbRange: [0, 1] });
        same(bytes, await pixels(), 'Normalized range changed expected colors');
        map.updateRaster('image', { collection: collection(10, true), property: ['r', 'g', 'b'] });
        const reflectance = await pixels();
        near(rgba(reflectance, 94, 94), [0, 255, 0, 255], 'Invisible outlier changed visible range');
        near(rgba(reflectance, 19, 108), [0, 0, 0, 0], 'No-data pixel should be transparent');
        checks.push('normalized range, visible-pixel stretch, and no-data transparency');

        map.updateRaster('image', { collection: source, property: 'scalar', transferFunction: { mode: 'linear' } });
        map.updateRenderInfo('image', { isColorMap: true });
        const scalar = await pixels();
        const legend = document.querySelector<HTMLElement>('#autkMapLegend')!;
        assert(legend.style.visibility === 'visible', 'Scalar legend is missing');
        map.updateRaster('image', { collection: source, property: ['r', 'g', 'b'] });
        assert(legend.style.visibility === 'hidden' && !layer.supportsColorMap && layer.rasterValues.length === 0, 'RGB kept scalar UI/data');
        map.updateColorMap('image', { colorMap: { interpolator: ColorMapInterpolator.SEQ_BLUES } });
        map.updateRenderInfo('image', { isColorMap: true });
        same(bytes, await pixels(), 'Scalar styling changed RGB pixels');
        assert(legend.style.visibility === 'hidden', 'RGB legend was re-enabled');
        map.updateRaster('image', { collection: source, property: 'scalar' });
        same(scalar, await pixels(), 'RGB transition changed stored scalar styling');
        assert(legend.style.visibility === 'visible', 'Returning to scalar did not restore the legend');
        checks.push('scalar/RGB/scalar pixels, legend state, and ignored RGB colormap updates');

        const warn = console.warn;
        let warnings = 0;
        console.warn = () => { warnings++; };
        try {
            map.updateRaster('image', { collection: { ...source, features: [{ ...source.features[0], properties: { r: [255], g: [0], b: [0] } }] }, property: ['r', 'g', 'b'] });
            map.updateRaster('image', { collection: source, property: ['r', 'g', 'b'], rgbRange: [255, 0] });
        } finally { console.warn = warn; }
        assert(warnings === 2 && layer.rasterMode === 'scalar' && legend.style.visibility === 'visible', 'Rejected update changed mode or legend');
        same(scalar, await pixels(), 'Rejected update changed displayed pixels');
        checks.push('wrong dimensions and invalid range preserve the displayed image');

        map.updateRaster('image', { collection: source, property: ['r', 'g', 'b'] });
        map.updateRenderInfo('image', { opacity: 0.5 });
        near(rgba(await pixels(), 34, 94), [128, 0, 0, 128], 'RGB layer opacity');
        checks.push('premultiplied RGB layer opacity');
        const validation = await device.popErrorScope();
        if (validation) errors.push(validation.message);
        await device.queue.onSubmittedWorkDone();
        assert(errors.length === 0, errors.join('\n'));
        return { status: 'passed', checks };
    } finally {
        for (const resource of resources) resource.destroy();
        map.destroy();
        canvas.remove();
    }
}
